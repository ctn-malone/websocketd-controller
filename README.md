Wrapper to execute command-line interface programs described by json files. It is meant to be run by [websocketd](https://github.com/joewalnes/websocketd)

Requires [QuickJS](https://github.com/ctn-malone/quickjs-cross-compiler/releases/tag/2021-03-27_2%2Bext-lib-0.4.0) for compilation

<u>NB</u>

* it is **meant to run** under *Linux* (although it **might work** on *Unix* systems)
* it does not offer any support for processing *stdin* (ie: it can only send *stdout* output over websocket)

# Rational

* reduces the number of instances of *websocketd* which need to be run (one instance is enough)
* gives the possibility to define the tasks dynamically (through an http api for example)
* static binary without dependency (except `setsid` binary which is likely to be installed on *Linux*)

# Compile

```
cd src
qjsc.sh -o websocketd-controller websocketd-controller.js
```

This will produce a **static binary** named `websocketd-controller`

<u>NB</u> : when using vanilla [QuickJS](https://bellard.org/quickjs/), a few extra steps are necessary to setup [qjs-ext-lib](https://github.com/ctn-malone/qjs-ext-lib)

* create a symlink named `ext` under `src` directory, pointing to the `src` directory of [qjs-ext-lib](https://github.com/ctn-malone/qjs-ext-lib) repository

```
.
├── CHANGELOG.md
├── README.md
└── src
    ├── ext -> ../../qjs-ext-lib/src
    └── websocketd-controller.js
```

# Usage

```
./websocketd-controller -h
Execute a task defined in a json file located in the context directory (--ctx-dir argument)

Script will get the task identifier by reading 'PATH_INFO' environment variable and 
get {task_id} by extracting the first part of the path

A file named {task_id}.json is expected to exist in context directory

https://github.com/ctn-malone/websocketd-controller

Version 0.2.1

Usage: PATH_INFO=/xxxx websocketd-controller [-h|--help] [-c|--ctx-dir] [-s|--same-origin] [--strict] [--dry-run]
    -c, --ctx-dir (*):       directory containing json context files
    -s, --same-origin:       enforce same origin policy
                             If set, ws connection can only be opened from a page
                             running on same server. Requires below environment
                             variables (set by websocketd)
                               - SERVER_NAME
                               - HTTP_ORIGIN
    --strict:                return an error if json task contains an unknown or invalid property
    --dry-run:               only output a json representation of what would be executed
                             without executing the command
    --no-new-session:        by default, task will be run in a new session by calling setsid.
                             Use this flag if setsid is not available
    -h, --help:              print help
```

Binary is meant to be run by [websocketd](https://github.com/joewalnes/websocketd)

## Examples

```
websocketd ./websocketd-controller -c /tmp/tasks
```

We assume content of directory `/tmp/tasks` is as below (two tasks defined)

```
tree -h
.
├── [  59]  01.json
└── [  63]  02.json

0 directories, 2 files
```

### Executing the task described in 01.json

```json
{
    "cmdLine":"ping -c 3 8.8.8.8",
    "oneShot":false
}
```

Connecting to ws://127.0.0.1:8080/01 will generate following ws frames

```
{"event":"stdout","data":"PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.","timestamp":1616687750596} 
{"event":"stdout","data":"64 bytes from 8.8.8.8: icmp_seq=1 ttl=113 time=17.7 ms","timestamp":1616687750596} 
{"event":"stdout","data":"64 bytes from 8.8.8.8: icmp_seq=2 ttl=113 time=17.4 ms","timestamp":1616687751597} 
{"event":"stdout","data":"64 bytes from 8.8.8.8: icmp_seq=3 ttl=113 time=17.5 ms","timestamp":1616687752600} 
{"event":"stdout","data":"","timestamp":1616687752600} 
{"event":"stdout","data":"--- 8.8.8.8 ping statistics ---","timestamp":1616687752600} 
{"event":"stdout","data":"3 packets transmitted, 3 received, 0% packet loss, time 2003ms","timestamp":1616687752600} 
{"event":"stdout","data":"rtt min/avg/max/mdev = 17.422/17.536/17.695/0.115 ms","timestamp":1616687752600} 
{"event":"exit","state":{"exitCode":0,"didTimeout":false},"timestamp":1616687752600} 
```

### Executing the task described in 02.json

```json
{
    "cmdLine":"traceroute -n 8.8.8.8",
    "oneShot":false
}
```

Connecting to ws://127.0.0.1:8080/02 will generate following ws frames

```
{"event":"stdout","data":"traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets","timestamp":1616688552094}
{"event":"stdout","data":" 1  * * *","timestamp":1616688552094}
{"event":"stdout","data":" 2  10.66.0.1  0.872 ms  0.966 ms  0.864 ms","timestamp":1616688552094}
{"event":"stdout","data":" 3  * * *","timestamp":1616688552094}
{"event":"stdout","data":" 4  10.1.94.210  0.983 ms 10.1.94.208  1.060 ms 10.1.94.214  0.667 ms","timestamp":1616688552094}
{"event":"stdout","data":" 5  212.47.225.204  1.021 ms 212.47.225.210  0.999 ms 212.47.225.198  1.402 ms","timestamp":1616688552095}
{"event":"stdout","data":" 6  195.154.1.188  0.606 ms 51.158.8.177  0.981 ms 195.154.1.188  1.056 ms","timestamp":1616688552095}
{"event":"stdout","data":" 7  62.210.0.155  1.381 ms 62.210.0.141  1.368 ms 62.210.0.149  1.213 ms","timestamp":1616688552095}
{"event":"stdout","data":" 8  209.85.149.12  1.125 ms 195.154.3.214  1.615 ms 209.85.149.12  1.150 ms","timestamp":1616688552095}
{"event":"stdout","data":" 9  108.170.244.225  2.277 ms 108.170.244.193  1.234 ms 108.170.244.161  1.169 ms","timestamp":1616688552095}
{"event":"stdout","data":"10  142.251.49.133  1.090 ms 64.233.174.93  1.110 ms 108.170.234.51  1.157 ms","timestamp":1616688552096}
{"event":"stdout","data":"11  8.8.8.8  1.619 ms  1.548 ms  1.499 ms","timestamp":1616688552096}
{"event":"exit","state":{"exitCode":0,"didTimeout":false},"timestamp":1616688552096}
```

# Json format

Following properties can be defined in a json file

* **[cmdLine]** (`string|string[]`) : command to execute
* usePath (`boolean`) : whether or not command should be search in path (default = `true`)
* useShell (`boolean`) : if `true`, command will be run using shell (default = `false`)
* shell (`string`) : shell to use (default = `/bin/sh`) (will be ignored if `useShell` is `false`)
* lineBuffered (`boolean`) : if `true`, `stdout` & `stderr` events will be emitted only after a line is complete (default = `true`)
* cwd (`string`) : if defined, controller will change to this directory before executing command
* redirectStderr (`boolean`) : if `true`, *stderr* of the task will be redirected to *stdout* (default = `false`)
* forwardStderr (`boolean`) : if `true`, an `stderr` event will be emitted whenever content is received on *stderr* from task
* timeout (`integer`) : if defined, task will be killed after this number of seconds if it is still running
* oneShot (`boolean`) : if `true`, task can be executed only once (ie: json file will be deleted afterwards)
* forwardStdin (`boolean`) : if `true`, input received from client will be forwarded to process (default = `true`)
* env (`object`) : dictionary of environment variables to define for the new task

Following environment variables will be available to child process
    
* all environment variables listed in https://github.com/joewalnes/websocketd/wiki/Environment-variables
* all variables defined in `env` object
* query string will be automatically parsed and a query parameter `xx` will be available as environment variable `QS_xx`

# Events

Following events will be emitted over the websocket

## stdout

Event will be emitted upon receiving content on *stdout* from task

* event (`string`) : `stdout`
* data (`string`) : content received from task
* timestamp (`integer`) : js timestamp (when content was received)

## stderr

Event will be emitted upon receiving content on *stderr from task

* event (`string`) : `stderr`
* data (`string`) : content received from task
* timestamp (`integer`) : js timestamp (when content was received)

## exit

Event will be emitted once the task is terminated

* event (`string`) : `exit`
* state (`object`)
  * exitCode (`integer`)
  * didTimeout (`boolean`) : whether or not task was killed after timeout
  * signal (`string`) : name of the signal used to terminate the task (only defined if task was terminated using a signal)
* timestamp (`integer`) : js timestamp (when task was terminated)

# Run unit tests

Run `run.js` under `test` directory

```
qjs.sh run.js
```
