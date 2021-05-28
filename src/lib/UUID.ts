/* tslint:disable:no-bitwise */

/**
 * Fast UUID generator, RFC4122 version 4 compliant.
 * @author Jeff Ward (jcward.com).
 * @license MIT license
 * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
 */
class UUID {
  private static readonly lut: string[] = [];

  private static initialize(): void {
    for (let i = 0; i < 256; i++) {
      this.lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
    }
  }

  public static generate(): string {
    if (this.lut.length === 0) {
      this.initialize();
    }

    const d0 = Math.random()*0xffffffff|0;
    const d1 = Math.random()*0xffffffff|0;
    const d2 = Math.random()*0xffffffff|0;
    const d3 = Math.random()*0xffffffff|0;

    const group0 = this.lut[d0&0xff] + this.lut[d0>>8&0xff] + this.lut[d0>>16&0xff] + this.lut[d0>>24&0xff];
    const group1 = this.lut[d1&0xff] + this.lut[d1>>8&0xff];
    const group2 = this.lut[d1>>16&0x0f|0x40] + this.lut[d1>>24&0xff];
    const group3 = this.lut[d2&0x3f|0x80] + this.lut[d2>>8&0xff];
    const group4 = this.lut[d2>>16&0xff] + this.lut[d2>>24&0xff] + this.lut[d3&0xff] + this.lut[d3>>8&0xff] + this.lut[d3>>16&0xff] + this.lut[d3>>24&0xff];

    return group0 + '-' + group1 + '-' + group2 + '-' + group3 + '-' + group4;
  }
}

export default UUID;
