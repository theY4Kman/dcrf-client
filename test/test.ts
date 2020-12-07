import EventEmitter from 'events';

import chai, {expect} from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {DCRFClient} from '../src';
chai.use(sinonChai);

import FifoDispatcher from '../src/dispatchers/fifo';
import {
  IDispatcher,
  ISendQueue,
  ISerializer,
  ITransport,
  MessagePreprocessor, PayloadPreprocessor
} from '../src/interface';
import FifoQueue from '../src/send_queues/fifo';


describe('FifoDispatcher', function () {
  describe('dispatch', function () {
    it('should call handler when selector is matched', function() {
      const dispatcher = new FifoDispatcher();
      const spy = sinon.spy();
      dispatcher.listen({test: 'unique'}, spy);
      dispatcher.dispatch({test: 'unique'});
      expect(spy).to.have.been.called;
    });

    it('should not call handler when selector is not matched', function() {
      const dispatcher = new FifoDispatcher();
      const spy = sinon.spy();
      dispatcher.listen({test: 'unique'}, spy);
      dispatcher.dispatch({test: 'clearly not unique'});
      expect(spy).not.to.have.been.called;
    });

    it('should match recursively', function() {
      const dispatcher = new FifoDispatcher();
      const spy = sinon.spy();
      dispatcher.listen({down: {the: {rabbit: 'hole'}}}, spy);
      dispatcher.dispatch({down: {the: {rabbit: 'hole'}}});
      expect(spy).to.have.been.called;
    });
  });

  describe('cancel', function () {
    it('should stop calling handler', function () {
      const dispatcher = new FifoDispatcher();
      const spy = sinon.spy();
      const listenerId = dispatcher.listen({test: 'unique'}, spy);
      dispatcher.dispatch({test: 'unique'});
      expect(spy).to.have.been.calledOnce;

      dispatcher.cancel(listenerId);
      dispatcher.dispatch({test: 'unique'});
      expect(spy).to.have.been.calledOnce;
    });
  });

  describe('once', function() {
    it('should call handler when selector is matched only once', function() {
      const dispatcher = new FifoDispatcher();
      const spy = sinon.spy();
      dispatcher.once({test: 'unique'}, spy);

      dispatcher.dispatch({test: 'unique'});
      expect(spy).to.have.been.calledOnce;

      dispatcher.dispatch({test: 'unique'});
      expect(spy).to.have.been.calledOnce;
    });
  });
});


describe('FifoQueue', function() {
  let queue: FifoQueue & {canSend: sinon.SinonStub};

  beforeEach(function() {
    const sendNow = sinon.stub();
    const canSend = sinon.stub().returns(true);
    queue = new FifoQueue(sendNow, canSend) as FifoQueue & {canSend: sinon.SinonStub};
  });

  describe('send', function () {
    it('should send message immediately if canSend() == true', function () {
      queue.send('test');
      expect(queue.sendNow).to.have.been.calledOnce.and.calledWith('test');
    });

    it('should queue message if canSend() == false', function () {
      sinon.spy(queue, 'queueMessage');
      queue.canSend.returns(false);

      queue.send('test');
      expect(queue.sendNow).not.to.have.been.called;
      expect(queue.queueMessage).to.have.been.calledOnce.and.calledWith('test');
    });
  });

  describe('queueMessage', function() {
    it('should push message to queue', function() {
      queue.queueMessage('test');
      expect(queue.queue).to.eql(['test']);
    });
  });

  describe('processQueue', function() {
    it('should send all queued messages immediately', function () {
      queue.queueMessage('test');
      queue.queueMessage('muffin');
      queue.processQueue();

      expect(queue.sendNow)
        .to.have.been.calledTwice
        .and.calledWith('test')
        .and.calledWith('muffin')
    });
  });
});


describe('DCRFClient', function() {
  let dispatcher: IDispatcher,
      transport: DummyTransport,
      queue: ISendQueue,
      serializer: ISerializer,
      api: DCRFClient;

  const initClient = (options = {}) => {
    dispatcher = new FifoDispatcher();
    transport = new DummyTransport();
    queue = new FifoQueue();
    serializer = new DummySerializer();

    const client = new DCRFClient(dispatcher, transport, queue, serializer, options);
    client.initialize();
    return client;
  }

  class DummyTransport extends EventEmitter implements ITransport {
    send = sinon.spy();
    hasConnected = false;

    public connect = sinon.spy(() => {
      this.isConnected.returns(true);
      if (this.hasConnected) {
        this.emit('reconnect');
      } else {
        this.emit('connect');
        this.hasConnected = true;
      }
    }) as unknown as () => boolean;

    disconnect = sinon.spy(() => {
      const wasConnected = this.isConnected();
      this.isConnected.returns(false);
      return wasConnected;
    });
    isConnected = sinon.stub().returns(false);
  }

  class DummySerializer implements ISerializer {
    serialize(message: object) {
      return message as unknown as string;
    }

    deserialize(bytes: string) {
      return bytes;
    }
  }

  beforeEach(function() {
    api = initClient();
  });


  describe('request', function() {
    it('sends request and listen for response', function() {
      const promise = api.request('test', {'key': 'unique'}).then(response => {
        expect(response).to.eql({'response': 'unique'});
      });

      expect(transport.send).to.have.been.calledOnce;
      const msg = transport.send.getCall(0).args[0];
      const stream = msg.stream;
      const requestId = msg.payload.request_id;

      transport.emit('message', {
        data: {
          stream,
          payload: {
            request_id: requestId,
            response_status: 200,
            data: {response: 'unique'}
          }
        }
      });

      return promise;
    });

    it('allows preprocessPayload to change payload before sending', function() {
      const preprocessPayload = sinon.spy((stream: string, payload: {[prop: string]: any}, requestId: string) => {
        payload.unique = 'muffin';
      }) as unknown as PayloadPreprocessor;

      const api = initClient({preprocessPayload});

      api.request('test', {});

      expect(preprocessPayload).to.have.been.calledOnce;
      expect(transport.send).to.have.been.calledOnce;
      const msg = transport.send.getCall(0).args[0];
      expect(msg.payload).to.have.property('unique', 'muffin');
    });

    it('allows preprocessMessage to change message before sending', function() {
      const preprocessMessage = sinon.spy((message: {[prop: string]: any}) => {
        message.unique = 'muffin';
      }) as unknown as MessagePreprocessor;

      const api = initClient({preprocessMessage});

      api.request('test', {});

      expect(preprocessMessage).to.have.been.calledOnce;
      expect(transport.send).to.have.been.calledOnce;
      const msg = transport.send.getCall(0).args[0];
      expect(msg).to.have.property('unique', 'muffin');
    });

    it('queues request until connected', function () {
      transport.disconnect();
      transport.hasConnected = false;

      api.request('test', {'key': 'unique'});
      expect(transport.send).not.to.have.been.called;

      transport.connect();
      expect(transport.send).to.have.been.calledOnce;
    });
  });


  describe('subscribe', function() {
    it('invokes callback on every update', function() {
      const id = 1337;
      const requestId = 'fake-request-id';

      const callback = sinon.spy();
      const handler: (data: {[prop: string]: any}) => void = ({ val }) => callback(val);
      const subscription = api.subscribe('stream', id, handler, requestId);

      const testPromise = subscription.then(() => {
        const emitUpdate = (val: string) => {
          transport.emit('message', {
            data: {
              stream: 'stream',
              payload: {
                action: 'update',
                data: {
                  pk: id,
                  val,
                },
                request_id: requestId,
              }
            }
          });
        };

        emitUpdate('muffin');
        expect(callback).to.have.been.calledOnce.and.calledWith('muffin');

        emitUpdate('taco');
        expect(callback).to.have.been.calledTwice.and.calledWith('taco');
      });

      // Acknowledge our subscription
      transport.emit('message', {
        data: {
          stream: 'stream',
          payload: {
            action: 'subscribe_instance',
            request_id: requestId,
            response_status: 201,
          }
        }
      });

      return testPromise;
    });

    [
      // Test without a custom pkField (default is "pk")
      { pkField: 'pk' },
      // Test with a custom pkField, with delete payload correction on
      { pkField: 'id', ensurePkFieldInDeleteEvents: true },
      // Test with a custom pkField, without delete payload correction on
      { pkField: 'id', ensurePkFieldInDeleteEvents: false },
    ].forEach(({ pkField, ensurePkFieldInDeleteEvents }) => {
      it(`invokes callback on delete (pkField=${pkField}, ensurePkFieldInDeleteEvents=${ensurePkFieldInDeleteEvents})`, function() {
        const api = initClient({ pkField, ensurePkFieldInDeleteEvents });

        const payloadPkField = ensurePkFieldInDeleteEvents ? pkField : 'pk';
        const id = 1337;
        const requestId = 'fake-request-id';

        const callback = sinon.spy();
        const handler: (data: {[prop: string]: any}) => void = ({ [payloadPkField]: pk }) => callback(pk);
        const subscription = api.subscribe('stream', id, handler, requestId);

        const testPromise = subscription.then(() => {
          const emitDelete = () => {
            transport.emit('message', {
              data: {
                stream: 'stream',
                payload: {
                  action: 'delete',
                  data: {
                    pk: id,
                  },
                  request_id: requestId,
                }
              }
            });
          };

          emitDelete();
          expect(callback).to.have.been.calledOnce.and.calledWith(1337);
        });

        // Acknowledge our subscription
        transport.emit('message', {
          data: {
            stream: 'stream',
            payload: {
              action: 'subscribe_instance',
              request_id: requestId,
              response_status: 201,
            }
          }
        });

        return testPromise;
      });
    })

    it('resubscribes on reconnect', function () {
      const stream = 'stream';
      const id = 1337;

      const subReqMatch = sinon.match({
        stream,
        payload: {
          action: 'subscribe_instance',
          pk: id,
        }
      });

      api.subscribe(stream, id, () => {});
      expect(transport.send).to.have.been.calledOnce.and.calledWithMatch(subReqMatch);

      transport.disconnect();
      transport.connect();
      expect(transport.send).to.have.been.calledTwice;
      expect(transport.send.secondCall).to.have.been.calledWithMatch(subReqMatch);
    });

    it('stops listening on cancel', function () {
      const id = 1337;
      const requestId = 'fake-request-id';

      const callback = sinon.spy();
      const handler: (data: {[prop: string]: any}) => void = ({ val }) => callback(val);
      const subscription = api.subscribe('stream', id, handler, requestId);

      const testPromise =  subscription.then(() => {
        const emitUpdate = (val: string) => {
          transport.emit('message', {
            data: {
              stream: 'stream',
              payload: {
                action: 'update',
                data: {
                  pk: id,
                  val
                },
                request_id: requestId,
              }
            }
          });
        };

        emitUpdate('muffin');
        expect(callback).to.have.been.calledOnce.and.calledWith('muffin');

        subscription.cancel();

        emitUpdate('taco');
        expect(callback).to.have.been.calledOnce;
      });

      // Acknowledge our subscription
      transport.emit('message', {
        data: {
          stream: 'stream',
          payload: {
            action: 'subscribe_instance',
            request_id: requestId,
            response_status: 201,
          }
        }
      });

      return testPromise;
    });
  });
});
