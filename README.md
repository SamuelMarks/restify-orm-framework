restify-waterline-utils
=======================

Utility functions for integrating waterline with restify; framework-style.

If using TypeScript, install `typings` with:

    typings install github:SamuelMarks/restify-waterline-utils/restify-waterline-utils.d.ts --save

Otherwise just use the [restify-waterline-utils-dist](https://github.com/SamuelMarks/restify-waterline-utils-dist) compiled output.

## Miscellaneous

Clone [restify-waterline-utils-dist](https://github.com/SamuelMarks/restify-waterline-utils-dist) one dir above where this repo was cloned, then synchronise with:

    find -type f -not -name "*.ts" -and -not -path "./.git/*" -and -not -path "./node-modules/*" -and -not -name '*.map' | cpio -pdamv ../restify-waterline-utils-dist
