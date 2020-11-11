# dcrf-client

[![npm version](https://badge.fury.io/js/dcrf-client.svg)](https://badge.fury.io/js/dcrf-client)

This package aims to provide a **simple**, **reliable**, and **generic** interface to consume [Django Channels REST Framework](https://github.com/hishnash/djangochannelsrestframework) powered WebSocket APIs.

NOTE: This library is a TypeScript port of [channels-api-client](https://github.com/theY4Kman/channels-api-client) to support Django Channels v2, and [@hishnash](https://github.com/hishnash)'s port of [linuxlewis](https://github.com/linuxlewis)'s [channels-api](https://github.com/linuxlewis/channels-api): [djangochannelsrestframework](https://github.com/hishnash/djangochannelsrestframework) and [channelsmultiplexer](https://github.com/hishnash/channelsmultiplexer).


## Features

 - Promises encapsulating the request/response cycle
 - Subscribe to updates with a callback
 - Automatically reconnect when connection is broken (with backoff — thanks to [reconnecting-websocket](https://github.com/pladaria/reconnecting-websocket))
 - Automatically restart subscriptions on reconnection
 - Requests are queued until a connection is made (no need to wait for connection before sending requests)


## Install

```bash
npm install dcrf-client
```


## Usage

```javascript
const dcrf = require('dcrf-client');
const client = dcrf.connect('wss://example.com');

client.create('people', {name: 'Alex'}).then(person => {
  console.info('Created:', person);
});

client.retrieve('people', 4).then(person => {
  console.info('Retrieved person 4:', person);
});

client.update('people', 4, {name: 'Johannes', address: '123 Easy St'}).then(person => {
  console.info('Overwrote person 4. Properties after change:', person);
});

client.patch('people', 4, {name: 'Jefe'}).then(person => {
  console.info('Changed name of person 4. Properties after change:', person);
});

client.delete('people', 4).then(() => {
  console.info('Deleted person 4. No one liked them, anyway :)');
});


// Subscribe to updates to person 1
const personalSubscription = client.subscribe('people', 1, (person, action) => {
  if (action === 'update') {
    console.info('Person 1 was updated:', person);
  }
  else if (action === 'delete') {
    console.info('Person 1 was deleted!')
  }
});

// Stop listening for updates
personalSubscription.cancel();


// Make a generic request to a multiplexer stream
client.request('mystream', {key: 'value'}).then(response => {
  console.info('Got mystream response, yo:', response);
});
```


## Configuration

The client can be customized by passing an object as the second argument to `connect()` or `createClient()`. The available options are described below.

```javascript
const dcrf = require('dcrf-client');

const client = dcrf.connect('wss://example.com', {
  preprocessPayload: (stream, payload, requestId) => {
    // Modify payload any way you see fit, before it's sent over the wire
    // For instance, add a custom authentication token:
    payload.token = '123';
    // Be sure not to return anything if you modify payload

    // Or, you can overwrite the payload by returning a new object:
    return {'this': 'is my new payload'};
  },

  preprocessMessage: (message) => {
    // The "message" is the final value which will be serialized and sent over the wire.
    // It includes the stream and the payload.

    // Modify the message any way you see fit, before its sent over the wire.
    message.token = 'abc';
    // Don't return anything if you modify message

    // Or, you can overwrite the the message by returning a new object:
    return {stream: 'creek', payload: 'craycrayload'};
  },

  // Options to be passed to ReconnectingWebsocket
  // See https://github.com/pladaria/reconnecting-websocket#available-options for more info
  websocket: {
    WebSocket?: any; // WebSocket constructor, if none provided, defaults to global WebSocket
    maxReconnectionDelay?: number; // max delay in ms between reconnections
    minReconnectionDelay?: number; // min delay in ms between reconnections
    reconnectionDelayGrowFactor?: number; // how fast the reconnection delay grows
    minUptime?: number; // min time in ms to consider connection as stable
    connectionTimeout?: number; // retry connect if not connected after this time, in ms
    maxRetries?: number; // maximum number of retries
    maxEnqueuedMessages?: number; // maximum number of messages to buffer until reconnection
    startClosed?: boolean; // start websocket in CLOSED state, call `.reconnect()` to connect
    debug?: boolean; // enables debug output
  }
});
```


## Development

There are two main test suites: unit tests (in `test/test.ts`) to verify intended behaviour of the client, and integration tests (in `test/integration/tests/test.ts`) to verify the client interacts with the server properly.

Both suites utilize Mocha as the test runner, though the integration tests are executed through py.test, to provide a live server to make requests against.

The integration tests require separate dependencies. To install them, first [install pipenv](https://pipenv.readthedocs.io/en/latest/install/#installing-pipenv), then run `pipenv install`.

To run both test suites: `npm run test`

To run unit tests: `npm run test:unit` or `mocha`

To run integration tests: `npm run test:unit` or `py.test`


### How do the integration tests work?

[pytest](https://docs.pytest.org/en/latest/) provides a number of hooks to modify how tests are collected, executed, and reported. These are utilized to discover tests from a Mocha suite, and execute them on pytest's command.

Our pytest-mocha plugin first spawns a subprocess to a custom Mocha runner, which collects its own TypeScript-based tests and emits that test info in JSON format to stdout. pytest-mocha reads this info and reports it to pytest, allowing pytest to print out the true names from the Mocha suite. Using [deasync](https://github.com/abbr/deasync), the Mocha process waits for pytest-mocha to send an acknowledgment (a newline) to stdin before continuing.

pytest-mocha then spins up a live Daphne server for the tests to utilize. Before each test, the Mocha suite emits another JSON message informing pytest-mocha which test is about to run. pytest-mocha replies with the connection info in JSON format to the Mocha runner's stdin. The Mocha suite uses this to initialize a DCRFClient for each test.

At the end of each test, Mocha emits a "test ended" message. pytest-mocha then wipes the database (with the help of pytest-django) for the next test run.

NOTE: this is sorta complicated and brittle. it would be nice to refactor this into something more robust. at least for now it provides some assurance the client interacts with the server properly, and also serves as an example for properly setting up a Django Channels project.
