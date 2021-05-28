import fs from "fs";

import chai, {expect} from 'chai';
import chaiSubset from 'chai-subset';
import {format, transports} from 'winston';
chai.use(chaiSubset);

import {rootLogger, getLogger} from '../../../src/logging';

// Enable all logging
rootLogger.level = 'debug';
// Print all logs to stderr, so pytest may parrot them
rootLogger
  .clear()
  .add(new transports.Console({
    level: 'silly',
    stderrLevels: Object.keys(rootLogger.levels),
  }));
// And colorize, for style
rootLogger.format = format.combine(
  format.colorize(),
  rootLogger.format,
);

import WebSocket from 'ws';

import dcrf, {DCRFClient} from '../../../src/';
import {DCRFGlobal} from '../../global';


const log = getLogger('dcrf.test.integration');


declare const global: DCRFGlobal;
global.WebSocket = WebSocket;


let serverInfo: {url: string, ws_url: string};


function readEvent(): {[prop: string]: any} {
  const buffer = Buffer.alloc(1024);
  let line = null;

  for (let i=0; i<buffer.length; i++) {
    fs.readSync(0, buffer, i, 1, null);

    if (buffer[i] === '\n'.charCodeAt(0)) {
      line = buffer.subarray(0, i).toString('utf-8');
      break;
    }
  }

  if (line == null) {
    throw new Error('Unable to read line from stdin');
  }

  return JSON.parse(line.trim());
}


function expectEvent(type: string): {[prop: string]: any} {
  const event = readEvent();

  if (event['type'] !== type) {
    throw new Error(`Expected type ${type}, found: ${event['type']}`);
  }

  return event;
}


beforeEach(function() {
  const event = expectEvent('server info');
  serverInfo = {
    url: event['url'],
    ws_url: event['ws_url'],
  };
});


describe('DCRFClient', function() {
  let client: DCRFClient;

  const suites = [
    {
      stream: 'things',
    },
    {
      stream: 'things_with_id',
      options: {
        pkField: 'id',
      },
    }
  ];

  suites.forEach(({ stream, options }) => {
    describe(stream, function () {
      beforeEach(function() {
        client = dcrf.createClient(`${serverInfo.ws_url}/ws`, options);

        // Wait for websocket connection before allowing tests to begin
        const onWebsocketConnected = new Promise(resolve => {
          client.transport.on('connect', () => resolve());
        })
        client.initialize();
        return onWebsocketConnected;
      });

      afterEach(function () {
        client.close();
      })

      describe('create', function() {

        it('returns created values', function() {
          return (
              client
                .create(stream, {name: 'unique'})
                .then(thing => {
                  expect(thing).to.containSubset({
                    name: 'unique',
                    counter: 0,
                  });
                })
          );
        });

        it('imbues retrieve with data', function() {
          return (
              client
                .create(stream, {name: 'unique'})
                .then(thing => client.retrieve(stream, thing[client.pkField]))
                .then(thing => {
                  expect(thing).to.containSubset({
                    name: 'unique',
                    counter: 0,
                  });
                })
          );
        });

      });


      describe('list', function() {

        it('returns empty set', function() {
          return (
              client
                .list(stream)
                .then(things => {
                  expect(things).to.eql([]);
                })
          )
        });

        it('returns created rows', function() {
          const rows = [
            {name: 'max'},
            {name: 'mary', counter: 1},
            {name: 'unique', counter: 1337},
          ];

          return (
              Promise.all(rows.map(row => client.create(stream, row)))
                .then(() => client.list(stream))
                .then(things => {
                  expect(things).to.containSubset(rows);
                })
          )
        });

      });


      describe('subscribe', function() {

        it('invokes callback on change', function(done) {
          expect(2);

          client
            .create(stream, {name: 'unique'})
            .then(thing => {
              client.subscribe(stream, thing[client.pkField], (thing, action) => {
                expect(action).to.equal('update');
                expect(thing.name).to.equal('new');
                done();
              });

              client.update(stream, thing[client.pkField], {name: 'new'})
            });
        });

        it('invokes callback on delete', function(done) {
          expect(1);

          client
            .create(stream, {name: 'unique'})
            .then(thing => {
              const originalId = thing[client.pkField];

              client
                .subscribe(stream, thing[client.pkField], (thing, action) => {
                  expect(action).to.equal('delete');
                  expect(thing).to.eql({
                    [client.pkField]: originalId,
                  });
                  done();
                })
                .then(() => {
                  client.delete(stream, thing[client.pkField]);
                });
            });
        });

      });
    });
  });
});
