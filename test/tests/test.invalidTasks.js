import { tester } from 'ext/tester.js';
import { Process } from 'ext/process.js';

export default () => {

    tester.test(`invalid tasks (missing file or invalid json)`, async (done) => {
        const cmdLine = `${globalThis.qjsBinary} ../src/websocketd-controller.js -c ./data/invalidTasks --strict`;
        const expectedExitCode = 3;
        let p, state;
        
        // file does not exist
        p = new Process(cmdLine, {env:{'PATH_INFO':'missingFile'}});
        state = await p.run();
        tester.assertEq(state.exitCode, expectedExitCode, `Exit code should be ${expectedExitCode} when task file does not exist`);

        // invalid json file
        p = new Process(cmdLine, {env:{'PATH_INFO':'invalidJson'}});
        state = await p.run();
        tester.assertEq(state.exitCode, expectedExitCode, `exit code should be ${expectedExitCode} when task file does not contain valid json`);

        done();
    }, {
        isAsync:true
    });

    tester.test(`invalid tasks (missing or invalid properties)`, async (done) => {
        const cmdLine = `${globalThis.qjsBinary} ../src/websocketd-controller.js -c ./data/invalidTasks --strict`;
        const expectedExitCode = 4;
        let p, state, task;
        
        const tasks = [
            // missing or invalid 'cmdLine'
            {tid:'01', stderr:"'cmdLine'"},
            {tid:'02', stderr:"'cmdLine'"},
            {tid:'03', stderr:"'cmdLine'"},
            // unknown property
            {tid:'04', stderr:"'unknown'"},            
            // invalid usePath property
            {tid:'05', stderr:"'usePath'"},            
            // invalid useShell property
            {tid:'06', stderr:"'useShell'"},            
            // invalid shell property
            {tid:'07', stderr:"'shell'"},            
            // invalid lineBuffered property
            {tid:'08', stderr:"'lineBuffered'"},            
            // invalid cwd property
            {tid:'09', stderr:"'cwd'"},            
            // invalid redirectStderr property
            {tid:'10', stderr:"'redirectStderr'"},            
            // invalid forwardStderr property
            {tid:'11', stderr:"'forwardStderr'"},            
            // invalid timeout property
            {tid:'12', stderr:"'timeout'"},            
            // invalid timeout property
            {tid:'13', stderr:"'oneShot'"},            
            // invalid env property
            {tid:'14', stderr:"'env'"},            
        ];

        for (let i = 0; i < tasks.length; ++i) {
            task = tasks[i];
            p = new Process(cmdLine, {env:{'PATH_INFO':task.tid}});
            state = await p.run();
            tester.assertEq(state.exitCode, expectedExitCode, `exit code should be ${expectedExitCode} when using file '${task.tid}.json'`);
            tester.assert(p.stderr.includes(task.stderr), `stderr should contain ${JSON.stringify(task.stderr)} when using file '${task.tid}.json'`, {actualResult:p.stderr});
        }

        done();
    }, {
        isAsync:true
    });

}