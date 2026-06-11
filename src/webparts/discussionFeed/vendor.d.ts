// TinyMCE 4 is bundled by path for an on-prem (no-CDN) build. @types/tinymce only
// declares the bare 'tinymce' module, so declare the sub-path imports we use.
declare module 'tinymce/tinymce' {
  const tinymce: any;
  export = tinymce;
}
declare module 'tinymce/themes/modern/theme';
declare module 'tinymce/plugins/table';
declare module 'tinymce/plugins/lists';
declare module 'tinymce/plugins/link';
declare module 'tinymce/plugins/image';
declare module 'tinymce/plugins/paste';
declare module 'tinymce/plugins/autolink';
