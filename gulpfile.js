'use strict';

const gulp = require('gulp');
const build = require('@microsoft/sp-build-web');

build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);

// TinyMCE ships its own CSS/skin that the SPFx module loader does not need to type-check
build.configureWebpack.mergeConfig({
  additionalConfiguration: (generatedConfiguration) => {
    return generatedConfiguration;
  }
});

build.initialize(gulp);
