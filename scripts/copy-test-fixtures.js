// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const src = path.resolve(__dirname, "..", "src", "test", "fixtures");
const dest = path.resolve(__dirname, "..", "out", "test", "fixtures");

fs.cpSync(src, dest, { recursive: true });
