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
npm install --save dcrf-client
```


## Usage

```javascript
const dcrf = require('channels-api');
const client = dcrf.connect('wss://example.com');

client.create('people', {name: 'Alex'}).then(person => {
  console.info('Created:', person);
});

client.retrieve('people', 4).then(person => {
  console.info('Retrieved person 4:', person);
});

client.update('people', 4, {name: 'Johannes'}).then(person => {
  console.info('Changed name of person 4. Properties after change:', person);
});

client.delete('people', 4).then(() => {
  console.info('Deleted person 4. No one liked them, anyway :)');
});


// Subscribe to updates to any person
const subscription = client.subscribe('people', 'update', person => {
  console.info('A person was updated:', person);
});

// Stop listening for updates
subscription.cancel();


// Subscribe to updates to person 1
const personalSubscription = client.subscribe('people', 'update', 1, person => {
  console.info('Person 1 was updated:', person);
});

// Stop listening
personalSubscription.cancel();


// Make a generic request to a multiplexer stream
client.request('mystream', {key: 'value'}).then(response => {
  console.info('Got mystream response, yo:', response);
});
```


## Configuration

The client can be customized by passing an object as the second argument to `connect()` or `createClient()`. The available options are described below.

```javascript
const dcrf = require('channels-api');

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
  // See https://github.com/pladaria/reconnecting-websocket#configure for more info
  websocket: {
    constructor: isGlobalWebSocket() ? WebSocket : null,
    maxReconnectionDelay: 10000,
    minReconnectionDelay: 1500,
    reconnectionDelayGrowFactor: 1.3,
    connectionTimeout: 4000,
    maxRetries: Infinity,
    debug: false,
  }
});
```
