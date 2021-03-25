import arg from 'ext/arg.js';
import * as path from 'ext/path.js';
import { tester } from 'ext/tester.js';
import { exec } from 'ext/process.js';
import testInvalidTasks from './tests/test.invalidTasks.js';
import testValidTasks from './tests/test.validTasks.js';

import * as std from 'std';

const testSuites = ['invalidTasks', 'validTasks'];
const verbosity_levels = [1, 2, 3];

globalThis.qjsBinary = 'qjs.sh';

const getUsage = () => {
    const message = `
Usage: ${path.getScriptName(true)} [-h|--help] [-s|--suite] [-v|--verbosity] [--stop-on-failure] [--no-color]
    -s  --suite:          name of the test suite to run (by default run all test suites)
                          One of [${testSuites.join(',')}]
    -v  --verbosity:      report verbosity (default = 3). Should be one of below
                            - 3: print all assertions & final summary
                            - 2: only print failed assertions & final summary
                            - 1: only print final summary
    --qjs-binary:         quickjs binary (by default use qjs.sh)
    --stop-on-failure:    stop on first failure
    --no-color       :    do not use color
    -h, --help:           print help
`.trim();
    return message;
}

const getHelp = () => {
    const message = `
Run tests
`.trim();
    return `${message}\n${getUsage()}`;
}

let args;
try {
    args = arg({
        '--suite': (v, n, p) => {
            const value = v.trim();
            if (!testSuites.includes(value)) {
                const err = new Error(`Invalid option value: ${n} (${v}) (should be one of [${testSuites.join(',')}])`);
                err.code = 'ARG_INVALID_OPTION';
                throw err;
            }
            return value;
        },
        '--verbosity': (v, n, p) => {
            const value = parseInt(v);
            let valid = true;
            if (isNaN(value) || !verbosity_levels.includes(value)) {
                const err = new Error(`Invalid option value: ${n} (${v}) (should be one of [${verbosity_levels.join(',')}])`);
                err.code = 'ARG_INVALID_OPTION';
                throw err;
            }
            return value;
        },
        '--qjs-binary': (v, n, p) => {
            return v.trim();
        }
        ,
        '--stop-on-failure': Boolean,
        '--no-color': Boolean,
        '--help': Boolean,
        // aliases
        '-s': '--suite',
        '-v': '--verbosity',
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
if (undefined !== args['--qjs-binary']) {
    globalThis.qjsBinary = args['--qjs-binary'];
}

/**
 * Ensure quickjs binary is valid
 */
const checkQjs = async () => {
    try {
        const output = await exec([globalThis.qjsBinary, '-e', 'console.log("quickjs")']);
        if ('quickjs' != output) {
            return false;
        }
    }
    catch (e) {
        return false;
    }
    return true;
}

const main = async () => {
    if (!await checkQjs()) {
        std.err.printf(`Quickjs binary '${globalThis.qjsBinary}' is not valid\n`);
        std.exit(1);
    }

    tester.setReportVerbosity(args['--verbosity']);
    tester.enableColorInReport(!args['--no-color']);
    tester.setResultHandler((r) => {
        if (!r.success) {
            std.exit(1);
        }
        std.exit(0);
    });

    const testSuite = args['--suite'];

    if (undefined === testSuite || 'invalidTasks' === testSuite) {
        testInvalidTasks();
    }
    if (undefined === testSuite || 'validTasks' === testSuite) {
        testValidTasks();
    }

    tester.run({stopOnFailure: args['--stop-on-failure']});
}
main();
