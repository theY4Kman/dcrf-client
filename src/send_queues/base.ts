import {ISendQueue} from '../interface';


export
class BaseSendQueue implements ISendQueue {
  /**
   * @param sendNow Function to call to send a message
   * @param canSend Function which should return whether send can be called
   * @note If parameters are not passed, initialize() should be called later.
   */
  constructor(sendNow?: (bytes: string) => number, canSend?: () => boolean) {
    if (sendNow && canSend) {
      this.initialize(sendNow, canSend);
    } else if (sendNow || canSend) {
      throw new Error('Both sendNow and canSend must be provided, or neither must.');
    }
  }
  //ts-ignore
  public sendNow: (bytes: string) => number = (bytes) => -1;
  public canSend: () => boolean = () => false;

  /**
   * @param sendNow Function to call to send a message
   * @param canSend Function which should return whether send can be called
   */
  public initialize(sendNow: (bytes: string) => number, canSend: () => boolean) {
    this.sendNow = sendNow;
    this.canSend = canSend;
  }

  //ts-ignore
  public send(bytes: string): number {
    throw new Error('not implemented');
  }

  //ts-ignore
  public queueMessage(bytes: string): boolean {
    throw new Error('not implemented');
  }
  public processQueue(): number {
    throw new Error('not implemented');
  }
}

export default BaseSendQueue;
