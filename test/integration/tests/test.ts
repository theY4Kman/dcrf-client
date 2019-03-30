import fs from "fs";

import chai, {expect} from 'chai';
import chaiSubset from 'chai-subset';
chai.use(chaiSubset);

import WebSocket from 'ws';

import dcrf, {DCRFClient} from '../../../src/';
import {DCRFGlobal} from '../../global';


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

  beforeEach(function() {
    client = dcrf.connect(`${serverInfo.ws_url}/ws`);
  });


  describe('create', function() {

    it('returns created values', function() {
      return (
          client.create('things', {name: 'unique'})
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
            .create('things', {name: 'unique'})
            .then(thing => client.retrieve('things', thing.pk))
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
            .list('things')
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
          Promise.all(rows.map(row => client.create('things', row)))
            .then(() => client.list('things'))
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
        .create('things', {name: 'unique'})
        .then(thing => {
          client.subscribe('things', thing.pk, (thing, action) => {
            expect(action).to.equal('update');
            expect(thing.name).to.equal('new');
            done();
          });

          client.update('things', thing.pk, {name: 'new'})
        });
    });

    it('invokes callback on delete', function(done) {
      expect(1);

      client
        .create('things', {name: 'unique'})
        .then(thing => {
          const originalId = thing.pk;

          client.subscribe('things', thing.pk, (thing, action) => {
            expect(action).to.equal('delete');
            expect(thing).to.eql({
              pk: originalId,
            });
            done();
          });

          client.delete('things', thing.pk)
        });
    });

  });
});
