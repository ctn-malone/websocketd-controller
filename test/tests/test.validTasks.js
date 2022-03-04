import { tester } from 'ext/tester.js';
import { Process } from 'ext/process.js';

import * as std from 'std';

const getTasksDir = (taskId) => {
    return `./data/validTasks/${taskId}`;
}

// load env.json
const getEnv = (taskId) => {
    const filepath = `${getTasksDir(taskId)}/env.json`;
    const str = std.loadFile(filepath);
    // file is optional
    if (null === str) {
        return {};
    }
    try {
        return JSON.parse(str);
    }
    catch (e) {
        throw new Error(`File '${filepath}' is not a valid json file`);
    }
}

// load expected JSON output (expected.json)
const getExpectedJsonOutput = (taskId) => {
    const filepath = `${getTasksDir(taskId)}/expected.json`;
    const str = std.loadFile(filepath);
    // file is missing
    if (null === str) {
        throw new Error(`File '${filepath}' does not exist`);
    }
    try {
        return JSON.parse(str);
    }
    catch (e) {
        throw new Error(`File '${filepath}' is not a valid json file`);
    }
}

// load expected text output (expected.txt)
const getExpectedTextOutput = (taskId) => {
    const filepath = `${getTasksDir(taskId)}/expected.txt`;
    const str = std.loadFile(filepath);
    // file is missing
    if (null === str) {
        throw new Error(`File '${filepath}' does not exist`);
    }
    return str.trim();
}

// load expected controller exit code (controller_exit_code.txt)
const getExpectedControllerExitCode = (taskId) => {
    const filepath = `${getTasksDir(taskId)}/controller_exit_code.txt`;
    const str = std.loadFile(filepath);
    // file is optional
    if (null === str) {
        return 0;
    }
    const code = parseInt(str.trim());
    if (isNaN(code)) {
        throw new Error(`Invalid controller exit code '${str}'`);
    }
    return code;
}

// load expected controller exit code (controller_exit_code.txt)
const getExpectedTaskExitCode = (taskId) => {
    const filepath = `${getTasksDir(taskId)}/task_exit_code.txt`;
    const str = std.loadFile(filepath);
    // file is optional
    if (null === str) {
        return 0;
    }
    const code = parseInt(str.trim());
    if (isNaN(code)) {
        throw new Error(`Invalid task exit code '${str}'`);
    }
    return code;
}

// parse all events from websocketd-controller output
const parseEvents = (content) => {
    const events = [];
    content.trim().split('\n').forEach((str) => {
        let obj;
        try {
            obj = JSON.parse(str.trim());
        }
        catch (e) {
            throw new Error(`Received non JSON output : ${JSON.stringify(str.trim())}'`);
        }
        events.push(obj);
    });
    return events;
}

// extract output from all 'stdout' events
const extractStdout = (content) => {
    const events = parseEvents(content);
    const lines = events.filter(e => 'stdout' == e.event).map(e => e.data);
    return lines.join('\n');
}

// extract state from 'exit' event
const extractState = (content) => {
    const events = parseEvents(content);
    return events.find(e => 'exit' == e.event).state;
}

export default () => {

    tester.test('valid json', async (done) => {
        // list of task ids
        const tasks = ['01', '02', '03', '04'];

        const expectedExitCode = 0;

        for (let i = 0; i < tasks.length; ++i) {
            const tid = tasks[i];
            const cmdLine = `${globalThis.qjsBinary} ../src/websocketd-controller.js -c ./data/validTasks/${tid} --strict --dry-run`;
            const env = getEnv(tid);
            const expectedOutput = getExpectedJsonOutput(tid);
            env['PATH_INFO'] = 'task';
            const p = new Process(cmdLine, {env:env});
            const state = await p.run();
            tester.assertEq(state.exitCode, expectedExitCode, `controller exit code should be ${expectedExitCode} when using file '${tid}.json'`);
            if (state.exitCode != expectedExitCode) {
                tester.assertEq(p.stderr, '', `stderr should be empty when using file '${tid}.json'`);
                continue;
            }
            let actualOutput;
            try {
                actualOutput = JSON.parse(p.stdout);
            }
            catch (e) {
                tester.assert(false, `stdout should be valid json`, {actualResult:actualOutput});
            }
            tester.assertEq(actualOutput, expectedOutput, `stdout should be as expected when using file '${tid}.json'`);
        }

        done();

    }, {
        isAsync:true
    });

    tester.test('forwardStdin', async (done) => {
        // list of task ids
        const tasks = ['05', '06'];

        for (let i = 0; i < tasks.length; ++i) {
            const tid = tasks[i];
            const cmdLine = `echo "hello" | ${globalThis.qjsBinary} ../src/websocketd-controller.js -c ./data/validTasks/${tid} --strict`;
            const env = getEnv(tid);
            const expectedOutput = getExpectedTextOutput(tid);
            const expectedExitCode = getExpectedTaskExitCode(tid);
            env['PATH_INFO'] = 'task';
            const p = new Process(cmdLine, {
                env:env,
                useShell:true
            });
            await p.run();
            const taskState = extractState(p.stdout);
            tester.assertEq(taskState.exitCode, expectedExitCode, `task exit code should be ${expectedExitCode} when using file '${tid}.json'`);
            const actualOutput = extractStdout(p.stdout);
            tester.assertEq(actualOutput, expectedOutput, `stdout should be as expected when using file '${tid}.json'`);
        }
        
        done();

    }, {
        isAsync:true
    });

    tester.test('passwords', async (done) => {
        // list of task ids
        const tasks = [
            // no password required
            '07',
            // valid password (single password)
            '08',
            // valid password (multiple passwords)
            '09',
            // missing password
            '10',
            // invalid password (single password)
            '11',
            // invalid password (multiple passwords)
            '12'
        ];

        for (let i = 0; i < tasks.length; ++i) {
            const tid = tasks[i];
            const cmdLine = `${globalThis.qjsBinary} ../src/websocketd-controller.js -c ./data/validTasks/${tid} --strict`;
            const env = getEnv(tid);
            const expectedOutput = getExpectedTextOutput(tid);
            const expectedExitCode = getExpectedControllerExitCode(tid);
            env['PATH_INFO'] = 'task';
            const p = new Process(cmdLine, {
                env:env
            });
            const state = await p.run();
            tester.assertEq(state.exitCode, expectedExitCode, `controller exit code should be ${expectedExitCode} when using file '${tid}.json'`);
            if (0 == state.exitCode) {
                const actualOutput = extractStdout(p.stdout);
                tester.assertEq(actualOutput, expectedOutput, `stdout should be as expected when using file '${tid}.json'`);
            }
            else {
                tester.assert(p.stderr.includes(expectedOutput), `stderr should contain ${JSON.stringify(expectedOutput)} when using file '${tid}.json'`, {actualResult:p.stderr});
            }
        }
        
        done();

    }, {
        isAsync:true
    });
}
