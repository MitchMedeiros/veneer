"use strict";
const fs = require("node:fs");

// Comment
const regex = /[a-z]+\d*/gi;
const tpl = `line ${1 + 2} ${`inner ${"deep"}`}`;

function* gen(limit = 10) {
  let i = 0;
  while (i < limit) yield i++;
}

class Animal extends Base {
  #secret = 1;
  static create(...args) {
    return new this(...args);
  }
  async speak({ loud = false } = {}) {
    const msg = loud ? "HEY" : "hey";
    return await Promise.resolve(msg);
  }
}

const obj = { a: 1, "b-c": [1, 2, 3], get x() { return this.a; }, [`k${1}`]: null };
var self = this, undef = void 0;
switch (typeof obj) {
  case "object":
    console.log(obj?.a ?? "none");
    break;
  default:
    throw new TypeError("bad");
}
export { Animal as default };
