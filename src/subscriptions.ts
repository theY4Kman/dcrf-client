/**
 * Promise representing the response to subscription, and offering an additional
 * cancel() method to stop listening for updates.
 *
 * This is returned from DCRFClient.subscribe.
 */
export
class SubscriptionPromise<T> extends Promise<T> {
  protected unsubscribe: () => boolean;

  constructor(executor: (resolve: (value?: T | PromiseLike<T>) => void,
                         reject: (reason?: any) => void
                        ) => void,
              unsubscribe: () => boolean) {
    super(executor);
    this.unsubscribe = unsubscribe;
  }

  /**
   * Stop listening for new events on this subscription
   * @return true if the subscription was active, false if it was already unsubscribed
   */
  public cancel(): boolean {
    return this.unsubscribe();
  }
}
