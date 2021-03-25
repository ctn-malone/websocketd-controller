import { tester } from 'ext/tester.js';
import { Process } from 'ext/process.js';

import * as std from 'std';

// list of task ids
const tasks = ['01', '02', '03', '04'];

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

// load expected output (expected.json)
const getExpectedOutput = (taskId) => {
    const filepath = `${getTasksDir(taskId)}/expected.json`;
    const str = std.loadFile(filepath);
    // file is optional
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

export default () => {

    tester.test('valid json', async (done) => {
        const expectedExitCode = 0;

        for (let i = 0; i < tasks.length; ++i) {
            const tid = tasks[i];
            const cmdLine = `${globalThis.qjsBinary} ../src/websocketd-controller.js -c ./data/validTasks/${tid} --strict --dry-run`;
            const env = getEnv(tid);
            const expectedOutput = getExpectedOutput(tid);
            env['PATH_INFO'] = 'task';
            const p = new Process(cmdLine, {env:env});
            const state = await p.run();
            if (state.exitCode != expectedExitCode) {
                tester.assertEq(state.exitCode, expectedExitCode, `exit code should be ${expectedExitCode} when using file '${tid}.json'`);
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
            tester.assertEq(actualOutput, expectedOutput, `output should be as expected when using file '${tid}.json'`);
        }

        done();

    }, {
        isAsync:true
    });
}
