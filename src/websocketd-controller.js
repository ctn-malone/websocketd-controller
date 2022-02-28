import * as std from 'std';
import * as os from 'os';

import arg from 'ext/arg.js';
import * as path from 'ext/path.js';
import { Process } from 'ext/process.js';

/*
    Execute a task defined in a json file with a format such as below

    {
        "cmdLine":string|string[],
        "usePath":boolean,
        "useShell":boolean,
        "shell":string,
        "lineBuffered":boolean,
        "cwd":string,
        "redirectStderr":boolean,
        "forwardStderr":boolean,
        "timeout":integer,
        "oneShot":boolean,
        "env":object
    }

    - cmdLine : mandatory, command line to execute.
                Any %xx% will be replaced with the value of environment variable xx
    - usePath : if {true}, PATH variable will be used (default = {true})
    - useShell : whether or not cmdLine should be cause using shell (default = {false})
    - shell : shell to use, will be ignored if {useShell} is {false} (default = /bin/sh)
    - lineBuffered : whether or not lines should be buffered (default = {true})
    - cwd : if set, controller will change to this directory before executing command
    - redirectStderr : if {true}, stderr will be redirected to stdout (default = {false})
    - forwardStderr : if {true}, stderr content will be forwarded to client (default = {false})
    - timeout : if defined, process will be killed after this number of seconds if it is still running
    - oneShot : if {true}, json file will be automatically removed after being read (default = {true})
    - env : used to define extra  environment variables for child process
            Any %xx% will be replaced with the value of environment variable xx

    NB: query string will be automatically parsed. A query parameter xx can be referenced as %QS_xx% (wherever an environment variable can be used)

    Examples

    {
        "cmdLine":"ping.sh -i %QS_ipaddr%",
        "timeout":3,
        "env":{
            "DEBUG":"%QS_debug"
        }
    }

    - execute a ping.sh
    - retrieve the destination ip address from the query string parameter 'ipaddr' and pass it as '-i' argument
    - add a new environment variable 'DEBUG' from the query string parameter 'debug'
    - kill process after 3s if it is still running

    Exit codes
    ==========

    - invalid parameter : 2
    - task not found or invalid json : 3
    - invalid task definition : 4
    - same origin policy mismatch : 5
    - child process exited successfully : 0
    - child process exited with an error or was killed : 1

    Environment variables
    =====================

    Following environment variables will be available to child process
    
    - all environment variables listed in https://github.com/joewalnes/websocketd/wiki/Environment-variables
    - all variables defined in {env} object
    - query string will be automatically parsed and a query parameter xx will be available as environment variable QS_xx

    Output
    ======

    Output printed to stdout will be forwarded to ws client by websocketd

    Whenever content is received from child process on stdout, a json event will be printed to stdout
        
        {
            "event":"stdout":
            "data":string,
            "timestamp":integer
        }

        Example

        {
            "event":"stdout",
            "data":"some content",
            "timestamp":1616147036940
        }

    Whenever content is received from child process on stderr, a json event will be printed to stdout if {forwardStderr} is {true}

        {
            "event":"stderr":
            "data":string,
            "timestamp":integer
        }

        Example

        {
            "event":"stderr",
            "data":"an error",
            "timestamp":1616147036940
        }

        NB: the error will also be printed on stderr and will be visible in websocketd logs

    When child process is terminated, a json event will be printed to stdout

        {
            "event":"exit",
            "state":{
                "exitCode":integer,
                "didTimeout":boolean,
                "signal":string
            },
            "timestamp":integer
        }

        NB: {signal} property will only be defined if child process was terminated using a signal
            
            This will happen if :

              - child process timed out
              - ws connection was closed by client before the end of child process

        Example

        {
            "event":"exit",
            "state":{
                "exitCode":0,
                "didTimeout":false
            },
            "timestamp":1616147036940
        }

 */

const VERSION = '0.2.0';

/*
    List of optional properties in json task
 */
const TASK_OPTIONAL_PROPERTIES = {
    usePath:{type:'boolean', default:true},
    useShell:{type:'boolean', default:false},
    shell:{type:'string', default:'/bin/sh', minLen:1},
    lineBuffered:{type:'boolean', default:true},
    cwd:{type:'string', minLen:1},
    redirectStderr:{type:'boolean', default:false},
    forwardStderr:{type:'boolean', default:false},
    timeout:{type:'integer', min:1},
    oneShot:{type:'boolean', default:true},
    env:{type:'object', default:{}}
};

const myDir = path.getScriptDir();
const mySelf = path.getScriptName(true);

const getUsage = () => {
    const message = `
Usage: PATH_INFO=/xxxx ${mySelf} [-h|--help] [-c|--ctx-dir] [-s|--same-origin] [--strict] [--dry-run]
    -c, --ctx-dir (*):       directory containing json context files
    -s, --same-origin:       enforce same origin policy
                             If set, ws connection can only be opened from a page
                             running on same server. Requires below environnement
                             variables (set by websocketd)
                               - SERVER_NAME
                               - HTTP_ORIGIN
    --strict:                return an error if json task contains an unknown or invalid property
    --dry-run:               only output a json representation of what would be executed
                             without executing the command
    --no-new-session:        by default, task will be run in a new session by calling setsid.
                             Use this flag if setsid is not available
    -h, --help:              print help
`.trim();
    return message;
}

const getHelp = () => {
    const message = `
Execute a task defined in a json file located in the context directory (--ctx-dir argument)

Script will get the task identifier by reading 'PATH_INFO' environment variable and 
get {task_id} by extracting the first part of the path

A file named {task_id}.json is expected to exist in context directory

https://github.com/ctn-malone/websocketd-controller

Version ${VERSION}
`.trimStart();
    return `${message}\n${getUsage()}`;
}

let args;
try {
    args = arg({
        '--ctx-dir': (v, n, p) => {
            let value = v.trim();
            if ('' == value) {
                value = '.';
            }
            while (value.endsWith('/')) {
                value = value.slice(0, -1);
            }
            if (0 !== os.stat(value)[1]) {
                const err = new Error(`Invalid option value: ${n} (${v}) (directory does not exist)`);
                err.code = 'ARG_INVALID_OPTION';
                throw err;
            }
            return value;
        },
        '--help': Boolean,
        '--same-origin': Boolean,
        '--strict': Boolean,
        '--dry-run': Boolean,
        '--no-new-session': Boolean,
        // aliases
        '-c': '--ctx-dir',
        '-s': '--same-origin',
    	'-h': '--help'
    });
}
catch (e) {
    switch (e.code) {
        case 'ARG_UNKNOWN_OPTION':
        case 'ARG_INVALID_OPTION':
        case 'ARG_MISSING_REQUIRED_SHORTARG':
        case 'ARG_MISSING_REQUIRED_LONGARG':
            std.err.printf(`${e.message.trim()}\n`);
            std.err.printf(`${getUsage()}\n`);
            std.exit(2);
    }
    throw e;
}
if (args['--help']) {
    std.err.printf(`${getHelp()}\n`);
    std.exit(2);
}
// ensure all required arguments were provided
['--ctx-dir'].forEach((n) => {
    if (undefined === args[n]) {
        std.err.printf(`Option ${n} is required\n`);
        std.err.printf(`${getUsage()}\n`);
        std.exit(2);
    }
});

// same origin policy
if (args['--same-origin']) {
    /*
        compare hosts in HTTP_ORIGIN & SERVER_NAME
     */
    const serverNameVar = std.getenv('SERVER_NAME');
    const httpOriginVar = std.getenv('HTTP_ORIGIN');
    let serverName, httpOrigin;
    if (undefined !== serverNameVar) {
        if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)?$/.test(serverNameVar)) {
            serverName = serverNameVar;
        }
    }
    if (undefined !== httpOriginVar) {
        const matches = httpOriginVar.match(/^https?:\/\/((?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)?)(:[0-9]+)?$/);
        if (null !== matches) {
            httpOrigin =  matches[1];
        }
    }
    if (undefined === serverNameVar) {
        std.err.printf(`Environment variable 'SERVER_NAME' is missing or invalid\n`);
        std.err.printf(`${getUsage()}\n`);
        std.exit(5);
    }
    if (undefined === httpOrigin) {
        std.err.printf(`Environment variable 'HTTP_ORIGIN' is missing or invalid\n`);
        std.err.printf(`${getUsage()}\n`);
        std.exit(5);
    }
    if (serverName != httpOrigin) {
        std.err.printf((`Same origin policy mismatch : '${serverName}' != '${httpOrigin}'\n`));
        std.exit(5);
    }
}

// Ensure {task_id} has been provided through environment variable 'PATH_INFO'
let taskId;
let pathInfo = std.getenv('PATH_INFO');
if (undefined !== pathInfo) {
    // remove leading '/'
    if (pathInfo.startsWith('/')) {
        pathInfo = pathInfo.substr(1);
    }
    const parts = pathInfo.split('/');
    const firstPart = parts[0].trim();
    if ('' != firstPart && '.' != firstPart && '..' != firstPart) {
        taskId = firstPart;
    }
}
if (undefined === taskId) {
    std.err.printf(`Environment variable 'PATH_INFO' is missing or invalid\n`);
    std.exit(3);
}

/*
    Parse query string
 */
let queryParams = {};
const qsVar = std.getenv('QUERY_STRING');
if (undefined !== qsVar && '' !== qsVar) {
    const arr = qsVar.split('&');
    arr.forEach((str, i) => {
        // find '='
        const pos = str.indexOf('=');
        if (-1 == pos) {
            return;
        }
        const key = str.substring(0, pos);
        const value = decodeURIComponent(str.substring(pos + 1));
        const varName = `QS_${key}`;
        queryParams[varName] = value;
    });
}

/**
 * Retrieve the value of a variable from 
 * 
 * @param {string} varName 
 * 
 * @return {string} variable value
 */
const getVar = (varName) => {
    if (undefined !== queryParams[varName]) {
        return queryParams[varName];
    }
    let value = std.getenv(varName);
    if (undefined === value) {
        value = '';
    }
    return value;
}

/**
 * Replace a variable in a command line
 * 
 * @param {string} cmdLine command line
 * @param {string} varName variable name
 * @param {string} varValue variable value
 * @param {boolean} enquote whether or not value should be enclosed with double quotes
 * 
 * @return {string}
 */
const replaceVarInCmdLine = (cmdLine, varName, varValue, enquote) => {
    let newCmdLine;
    // enclose in double quotes
    if (enquote) {
        varValue = varValue.replaceAll('"', '\\"');
        newCmdLine = cmdLine.replaceAll(`%${varName}%`, `"${varValue}"`);
    }
    else {
        newCmdLine = cmdLine.replaceAll(`%${varName}%`, varValue);
    }
    return newCmdLine;
}

/**
 * Parse a command line into an array of arguments
 *
 * @param {string} command line
 *
 * @return {string[} arguments
 */
const parseArgs = (command) => {
    // NB: regexp will fail in case an orphan quote or double quote exists
    const args = command.match(/[^"' \t]+|["'](?:\\["']|[^"'])*['"]/g);
    return args.map((e) => {
        // remove enclosing double quotes
        if (e.startsWith('"') && e.endsWith('"')) {
            return e.slice(1, -1);
        }
        // remove enclosing single quotes
        if (e.startsWith("'") && e.endsWith("'")) {
            return e.slice(1, -1);
        }
        return e;
    });
}

/**
 * Parse JSON file
 * 
 * @return {object} task object (an exception will be thrown in case of error)
 */
const getCtx = () => {
    const filename = `${taskId}.json`;
    const file = `${args['--ctx-dir']}/${filename}`;
    let ctx;
    if (0 !== os.stat(file)[1]) {
        const msg = `File '${filename}' does not exist in context directory`;
        const err = new Error(msg);
        err.missingFileOrInvalidJson = true;
        throw err;
    }
    const str = std.loadFile(file);
    if (null === str) {
        const msg = `File '${filename}' does not exist in context directory`;
        const err = new Error(msg);
        err.missingFileOrInvalidJson = true;
        throw err;
    }
    try {
        ctx = std.parseExtJSON(str);
    }
    catch (e) {
        const msg = `File '${filename}' is not a valid json file`;
        const err = new Error(msg);
        err.missingFileOrInvalidJson = true;
        throw err;
    }
    let missingCmdLine = false;
    if (undefined === ctx.cmdLine) {
        missingCmdLine = true;
    }
    else {
        // single line
        if ('string' == typeof ctx.cmdLine) {
            if ('' === ctx.cmdLine) {
                missingCmdLine = true;
            }
            else {
                ctx.cmdLine = parseArgs(ctx.cmdLine);
            }
        }
        // exec-like array
        else if (Array.isArray(ctx.cmdLine)) {
            if (0 == ctx.cmdLine.length) {
                missingCmdLine = true;
            }
        }
    }
    if (missingCmdLine) {
        const msg = `Missing 'cmdLine' in file '${filename}'`;
        const err = new Error(msg);
        throw err;
    }
    // find %xx% variables
    for (let i = 0; i < ctx.cmdLine.length; ++i) {
        const matches = ctx.cmdLine[i].matchAll(/%([a-zA-Z_0-9.]+)%/g);
        for (const m of matches) {
            const varName = m[1];
            let varValue = getVar(varName);
            if (undefined === varValue) {
                varValue = '';
            }
            ctx.cmdLine[i] = replaceVarInCmdLine(ctx.cmdLine[i], varName, varValue, true === ctx.useShell);
        }
    }
    // check all optional tasks
    if (args['--strict']) {
        for (const [key, value] of Object.entries(ctx)) {
            if ('cmdLine' == key) {
                continue;
            }
            // unknown property
            if (undefined === TASK_OPTIONAL_PROPERTIES[key]) {
                const msg = `Unknown '${key}' property in file '${filename}'`;
                const err = new Error(msg);
                throw err;
            }
            // string
            if ('string' == TASK_OPTIONAL_PROPERTIES[key].type) {
                if ('string' != typeof value) {
                    const msg = `Invalid value '${value}' found for property '${key}' in file '${filename}' (should be a ${TASK_OPTIONAL_PROPERTIES[key].type})`
                    const err = new Error(msg);
                    throw err;
                }
                if (undefined !== TASK_OPTIONAL_PROPERTIES[key].minLen) {
                    if (value.length < TASK_OPTIONAL_PROPERTIES[key].minLen) {
                        const msg = `Invalid value '${value}' found for property '${key}' in file '${filename}' (length should be >= ${TASK_OPTIONAL_PROPERTIES[key].minLen})`
                        const err = new Error(msg);
                        throw err;
                    }
                }
            }
            // integer
            else if ('integer' == TASK_OPTIONAL_PROPERTIES[key].type) {
                if ('number' != typeof value) {
                    const msg = `Invalid value '${value}' found for property '${key}' in file '${filename}' (should be a ${TASK_OPTIONAL_PROPERTIES[key].type})`
                    const err = new Error(msg);
                    throw err;
                }
                const intValue = parseInt(value);
                if (isNaN(intValue)) {
                    const msg = `Invalid value '${value}' found for property '${key}' in file '${filename}' (should be a ${TASK_OPTIONAL_PROPERTIES[key].type})`
                    const err = new Error(msg);
                    throw err;
                }
                if (undefined !== TASK_OPTIONAL_PROPERTIES[key].min) {
                    if (intValue < TASK_OPTIONAL_PROPERTIES[key].min) {
                        const msg = `Invalid value '${value}' found for property '${key}' in file '${filename}' (should be >= ${TASK_OPTIONAL_PROPERTIES[key].min})`
                        const err = new Error(msg);
                        throw err;
                    }
                }
                ctx[key] = intValue;
            }
            // boolean
            else if ('boolean' == TASK_OPTIONAL_PROPERTIES[key].type) {
                if ('boolean' != typeof value) {
                    const msg = `Invalid value '${value}' found for property '${key}' in file '${filename}' (should be a ${TASK_OPTIONAL_PROPERTIES[key].type})`
                    const err = new Error(msg);
                    throw err;
                }
            }
            // object
            else {
                if ('object' != typeof value) {
                    const msg = `Invalid value '${value}' found for property '${key}' in file '${filename}' (should be a ${TASK_OPTIONAL_PROPERTIES[key].type})`
                    const err = new Error(msg);
                    throw err;
                }
            }
        }
    }
    // define optional values
    for (const [key, obj] of Object.entries(TASK_OPTIONAL_PROPERTIES)) {
        if (undefined === ctx[key] && undefined !== obj.default) {
            ctx[key] = obj.default;
        }
    }

    // remove file
    if (false !== ctx.oneShot) {
        os.remove(file);
    }
    return ctx;
}

let ctx;
try {
    ctx = getCtx();
}
catch (e) {
    std.err.printf(`${e.message}\n`);
    let exitCode = 4;
    if (true === e.missingFileOrInvalidJson) {
        exitCode = 3;
    }
    std.exit(exitCode);
}

// process options
const options = {
    // use a new session so that we can trap signals
    newSession:!args['--no-new-session'],
    usePath:ctx.usePath,
    useShell:ctx.useShell,
    lineBuffered:ctx.lineBuffered,
    redirectStderr:ctx.redirectStderr,
    forwardStderr:ctx.forwardStderr,
    env:queryParams,
    replaceEnv:false
};
if (undefined !== ctx.cwd) {
    options.cwd = ctx.cwd;
}
// use shell
if (options.useShell) {
    if (undefined !== ctx.shell) {
        options.shell = ctx.shell;
    }
}
// timeout
if (undefined !== ctx.timeout) {
    const timeout = parseInt(ctx.timeout);
    if (!isNaN(timeout) && timeout > 0) {
        options.timeout = timeout;
    }
}
// child environment
if (undefined !== ctx.env && 'object' == typeof ctx.env) {
    for (const [key, value] of Object.entries(ctx.env)) {
        options.env[key] = value;
        const matches = value.matchAll(/%([a-zA-Z_0-9.]+)%/g);
        for (const m of matches) {
            const varName = m[1];
            let varValue = getVar(varName);
            if (undefined === varValue) {
                varValue = '';
            }
            options.env[key] = replaceVarInCmdLine(options.env[key], varName, varValue, false);
        }
    }
}

// output json representation, without executing
if (args['--dry-run']) {
    const obj = {
        cmdLine:ctx.cmdLine,
        options:options
    };
    std.out.puts(`${JSON.stringify(obj)}\n`);
    std.out.flush();
    std.exit(0);
}

// stdout handler
const onStdout = (e) => {
    const obj = {
        event:'stdout',
        data:e.data,
        timestamp:Date.now()
    };
    std.out.puts(`${JSON.stringify(obj)}\n`);
    std.out.flush();
}

// stderr handler
const onStderr = (e) => {
    // forward stderr to client
    if (options.forwardStderr) {
        const obj = {
            event:'stderr',
            data:e.data,
            timestamp:Date.now()
        };
        std.out.puts(`${JSON.stringify(obj)}\n`);
        std.out.flush();
    }
    if (options.lineBuffered) {
        std.err.puts(`${e.data}\n`);
    }
    else {
        std.err.puts(e.data);
    }
    std.err.flush();
}

// create & run process
const p = new Process(ctx.cmdLine, options);
p.setEventListener('stdout', onStdout);
p.setEventListener('stderr', onStderr);
p.run().then((state) => {
    // send event indicating program exited
    const obj = {
        event:'exit',
        state:{
            exitCode:state.exitCode,
            didTimeout:state.didTimeout,
            signal:state.signal
        },
        timestamp:Date.now()
    };
    std.out.puts(`${JSON.stringify(obj)}\n`);
    std.out.flush();
    if (0 == state.exitCode) {
        std.exit(0);
    }
    else {
        std.exit(1);
    }
});

/*
    trap signals sent by websocketd, send SIGTERM and 
    wait for child process to terminate
 */
os.signal(os.SIGINT, () => {
    p.kill(os.SIGTERM);
});
os.signal(os.SIGTERM, () => {
    p.kill(os.SIGTERM);
});
