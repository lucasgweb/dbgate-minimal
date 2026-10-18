import * as ace from 'ace-builds/src-noconflict/ace';

// Black editor theme matching the dark UI theme; the primary color (sky) is used for keywords, cursor and selection
const cssText = `
.ace-dbgate-dark {
  background-color: var(--theme-content-background, #090909);
  color: #e5e5e5;
}
.ace-dbgate-dark .ace_gutter {
  background: var(--theme-content-background, #090909);
  color: #525252;
}
.ace-dbgate-dark .ace_gutter-active-line {
  background-color: transparent;
}
.ace-dbgate-dark .ace_gutter-cell.ace_gutter-active-line {
  color: #d4d4d4;
}
.ace-dbgate-dark .ace_print-margin {
  width: 1px;
  background: #202020;
}
.ace-dbgate-dark .ace_cursor {
  color: #38bdf8;
}
.ace-dbgate-dark .ace_marker-layer .ace_selection {
  background: rgba(14, 165, 233, 0.28);
}
.ace-dbgate-dark.ace_multiselect .ace_selection.ace_start {
  box-shadow: 0 0 3px 0 #000;
}
.ace-dbgate-dark .ace_marker-layer .ace_step {
  background: rgba(250, 204, 21, 0.2);
}
.ace-dbgate-dark .ace_marker-layer .ace_bracket {
  margin: -1px 0 0 -1px;
  border: 1px solid rgba(56, 189, 248, 0.6);
  border-radius: 2px;
}
.ace-dbgate-dark .ace_marker-layer .ace_active-line {
  background: rgba(255, 255, 255, 0.04);
}
.ace-dbgate-dark .ace_marker-layer .ace_selected-word {
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 2px;
}
.ace-dbgate-dark .ace_invisible {
  color: #404040;
}
.ace-dbgate-dark .ace_indent-guide {
  background: linear-gradient(to right, #1f1f1f 1px, transparent 1px);
}
.ace-dbgate-dark .ace_fold {
  background-color: #38bdf8;
  border-color: #e5e5e5;
}
.ace-dbgate-dark .ace_keyword,
.ace-dbgate-dark .ace_meta {
  color: #ff79c6;
}
.ace-dbgate-dark .ace_storage,
.ace-dbgate-dark .ace_storage.ace_type,
.ace-dbgate-dark .ace_support.ace_type {
  color: #8be9fd;
}
.ace-dbgate-dark .ace_support.ace_function,
.ace-dbgate-dark .ace_entity.ace_name.ace_function {
  color: #ffb86c;
}
.ace-dbgate-dark .ace_string,
.ace-dbgate-dark .ace_string.ace_regexp {
  color: #f1fa8c;
}
.ace-dbgate-dark .ace_constant.ace_numeric,
.ace-dbgate-dark .ace_constant.ace_language,
.ace-dbgate-dark .ace_constant.ace_character,
.ace-dbgate-dark .ace_constant.ace_other {
  color: #bd93f9;
}
.ace-dbgate-dark .ace_comment {
  color: #7f8aa8;
  font-style: italic;
}
.ace-dbgate-dark .ace_keyword.ace_operator,
.ace-dbgate-dark .ace_punctuation,
.ace-dbgate-dark .ace_paren {
  color: #a3a3a3;
}
.ace-dbgate-dark .ace_variable,
.ace-dbgate-dark .ace_identifier {
  color: #f8f8f2;
}
.ace-dbgate-dark .ace_variable.ace_parameter {
  color: #f9a8d4;
}
.ace-dbgate-dark .ace_invalid {
  color: #fff;
  background-color: #b91c1c;
}
.ace-dbgate-dark .ace_invalid.ace_deprecated {
  color: #fff;
  background-color: #7e22ce;
}
.ace-dbgate-dark.ace_dark.ace_editor.ace_autocomplete {
  background: #181818;
  color: #e5e5e5;
  border: 1px solid #303030;
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
}
.ace-dbgate-dark.ace_dark.ace_editor.ace_autocomplete .ace_marker-layer .ace_active-line {
  background: rgba(14, 165, 233, 0.25);
}
.ace-dbgate-dark.ace_dark.ace_editor.ace_autocomplete .ace_line-hover {
  background: rgba(255, 255, 255, 0.06);
  border: none;
}
.ace-dbgate-dark.ace_dark.ace_editor.ace_autocomplete .ace_completion-highlight {
  color: #38bdf8;
}
.ace-dbgate-dark.ace_dark.ace_editor.ace_autocomplete .ace_completion-meta {
  color: #737373;
}
`;

ace.define(
  'ace/theme/dbgate_dark',
  ['require', 'exports', 'module', 'ace/lib/dom'],
  function (require, exports) {
    exports.isDark = true;
    exports.cssClass = 'ace-dbgate-dark';
    exports.cssText = cssText;
    const dom = require('../lib/dom');
    dom.importCssString(exports.cssText, exports.cssClass, false);
  }
);
