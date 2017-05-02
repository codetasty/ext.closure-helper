define(function(require, exports, module) {
	var ExtensionManager = require('core/extensionManager');
	
	var Fn = require('core/fn');
	
	var Editor = require('modules/editor/editor');
	var EditorEditors = require('modules/editor/ext/editors');
	var EditorSession = require('modules/editor/ext/session');
	var EditorSplit = require('modules/editor/ext/split');
	
	var TokenIterator = require("ace/token_iterator").TokenIterator;
	
	var Extension = ExtensionManager.register({
		name: 'closure-helper',
	}, {
		init: function() {
			var self = this;
			
			EditorSession.on('focus', this.onSessionFocus);
			EditorEditors.on('session.changeCursor', this.onCursorChange);
		},
		destroy: function() {
			EditorSession.off('focus', this.onSessionFocus);
			EditorEditors.off('session.changeCursor', this.onCursorChange);
		},
		onSessionFocus: function(session) {
			if (Extension._modes.indexOf(session.mode) !== -1) {
				Extension.deffer('closures', function() {
					Extension.getClosures(session);
				}, 200);
			}
		},
		onCursorChange: function(session, cursor) {
			if (session && session.focus) {
				if (Extension._modes.indexOf(session.mode) !== -1) {
					Extension.deffer('closures', function() {
						Extension.getClosures(session);
					}, 200);
				}
			}
		},
		_modes: ['less', 'scss', 'html', 'php', 'javascript'],
		_checking: false,
		detector: {
			less: function(editor, cursor, session) {
				var closure = [];
				var range;
				var iterator;
				var name;
				var ended;
				
				if (!session || !session.foldWidgets) {
					return closure;
				}
				
				for (var i = 0; i <= cursor.row; i++) {
					if (session.foldWidgets[i] === "") {
						continue;
					}
					
					range = session.getFoldWidgetRange(i);
					if (!range) {
						continue;
					}
					
					if (range.start.row < cursor.row || (range.start.row == cursor.row && range.start.column <= cursor.column)) {
						if (range.end.row > cursor.row || (range.end.row == cursor.row && range.end.column >= cursor.column)) {
							name = '';
							iterator = new TokenIterator(session, range.start.row, range.start.column);
							ended = false;
							
							var inParen = 0;
							
							while (token = iterator.stepBackward()) {
								if (token.type == "text" && token.value.match(/^\s+$/)) {
									name = ' ' + name;
								} else if (token.type == 'variable.language') {
									name = token.value + name;
								} else if (token.type == 'identifier') {
									name = token.value + name;
								} else if (token.type == "text" && !token.value.match(/\;/) && !token.value.match(/(\{|\})/)) {
									trimmed = $.trim(token.value) == ',' ? ', ' : token.value;
									name = trimmed + name;
								} else if (['keyword', 'keyword.operator', 'variable', 'string', 'constant.numeric', 'support.type.unknownProperty', 'support.function'].indexOf(token.type) !== -1) {
									name = token.value + name;
								} else if ((token.type == "paren.lparen" && token.value.trim() != '{') || (token.type == "paren.rparen" && token.value.trim() != '}')) {
									inParen += token.value == ')' || token.value == ']' ? 1 : -1;
									name = token.value + name;
								} else if (inParen > 0) {
									name = token.value + name;
								} else {
									closure.push({
										pos: range.start,
										name: $.trim(name)
									});
									ended = true;
									break;
								}
							}
							
							if (!ended) {
								closure.push({
									pos: range.start,
									name: $.trim(name)
								});
							}
						} else {
							i = range.end.row;
						}
					}
				}
				
				return closure;
			},
			scss: function() {
				return this.less.apply(this, arguments);
			},
			_htmlVoidTags: ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'],
			html: function(editor, cursor, session) {
				var closure = [];
				var closed = [];
				var token = null;
				var lastClass = null;
				var tag = null;
				
				var iterator = new TokenIterator(session, cursor.row, cursor.column);
				
				while (token = iterator.stepBackward()) {
					if (token.type == 'string.attribute-value.xml') {
						iterator.stepBackward();
						
						if (iterator.stepBackward().value == 'class') {
							lastClass = token.value.replace(/(\'|\")/gi, '');
						}
					}
					
					if (token.type != 'meta.tag.tag-name.xml' && token.type != 'meta.tag.anchor.tag-name.xml') {
						continue;
					}
					
					if (token.value == 'body' || token.value == 'html') {
						break;
					}
					
					if (this._htmlVoidTags.indexOf(token.value.toLowerCase()) !== -1) {
						continue;
					}
					
					if (iterator.stepBackward().type == 'meta.tag.punctuation.end-tag-open.xml') {
						closed.push(token.value);
					} else {
						if (closed.length && closed[closed.length-1] == token.value) {
							closed.pop();
						} else {
							var tag = $.trim(token.value);
							
							if (tag == 'svg') {
								closure = [];
							}
							
							closure.push({
								pos: {
									row: iterator.getCurrentTokenRow(),
									column: 0
								},
								name: (tag == 'div' && lastClass ? '' : tag) + (lastClass ? '.' + lastClass : '')
							});
						}
					}
					
					lastClass = null;
				}
				
				
				return closure.reverse();
			},
			php: function() {
				return this.html.apply(this, arguments);
			},
			javascript: function(editor, cursor, session) {
				var closure = [];
				var range;
				var iterator;
				var name;
				var ended;
				
				if (!session || !session.foldWidgets) {
					return closure;
				}
				
				for (var i = 0; i <= cursor.row; i++) {
					if (session.foldWidgets[i] === "") {
						continue;
					}
					
					range = session.getFoldWidgetRange(i);
					if (!range) {
						continue;
					}
					
					if (range.start.row < cursor.row || (range.start.row == cursor.row && range.start.column <= cursor.column)) {
						if (range.end.row > cursor.row || (range.end.row == cursor.row && range.end.column >= cursor.column)) {
							name = '';
							iterator = new TokenIterator(session, range.start.row, range.start.column);
							ended = false;
							
							var inParen = 0;
							var possibleTotal = 20;
							var possible = possibleTotal;
							var isNameNext = false;
							var isVariable = false;
							var isProperty = false;
							var closedParens = false;
							var nextMustType = null;
							
							while (token = iterator.stepBackward()) {
								if (!possible) {
									break;
								}
								
								if (token.type == 'punctuation.operator' && (token.value == ';' || token.value == ',')) {
									break;
								} else if (isNameNext && token.type != 'text') {
									if (nextMustType && nextMustType != token.type) {
										break;
									}
									
									name = token.value + (token.type == 'entity.name.function' ? '()' : '') + name;
									
									if (isVariable) {
										name = 'var ' + name;
									} else if (isProperty) {
										name = '.' + name;
									}
									
									if (token.type != 'punctuation.operator') {
										nextMustType = 'punctuation.operator';
									} else {
										nextMustType = null;
									}
								} else if (token.type == 'punctuation.operator' && token.value == ':') {
									isNameNext = true;
									isProperty = true;
								} else if (token.type == 'keyword.operator' && token.value == '=') {
									isNameNext = true;
									isVariable = true;
								} else if (token.type == "paren.lparen" || token.type == "paren.rparen") {
									inParen += token.value == ')' || token.value == ']' || token.value == '}' ? 1 : -1;
									
									if (inParen === 0) {
										closedParens = true;
									}
									
									if (token.value == '(' && possible == possibleTotal) {
										isNameNext = true;
									}
								} else if (token.type == 'keyword' && closedParens) {
									isNameNext = true;
									iterator.stepForward();
								} else if (token.type == 'identifier' && possible == possibleTotal) {
									name = token.value + '()';
									isNameNext = true;
								}
								
								if (token.type != 'text') {
									possible--;
								}
							}
							
							if (!ended && name) {
								closure.push({
									pos: range.start,
									name: name
								});
							}
						} else {
							i = range.end.row;
						}
					}
				}
				
				return closure;
			},
		},
		getClosures: function(session) {
			this.clearDeffer('closures');
			
			if (this._checking || !session || !session.focus) {
				return false;
			}
			
			this._checking = true;
			
			var mode = session.mode;
			var editor = session.editor
			var cursor = editor.getCursorPosition();
			
			var closure = this.detector[mode](editor, cursor, session.data);
			
			var $toolbar = session.$toolbar.find('.toolbar-left');
			
			$toolbar.children(':not(.sticky)').remove();
			
			if (closure.length) {
				closure.forEach(function(obj) {
					$item = $('<li></li>');
					
					$item.html(obj.name + " ").data('pos', obj.pos); //add space if user selects tree
					
					$item.click(function() {
						session.data.selection.moveCursorTo($(this).data('pos').row, $(this).data('pos').column);
						session.data.selection.clearSelection();
						editor.scrollToLine($(this).data('pos').row, false,  true);
					});
					
					$toolbar.append($item);
				});
			}
			
			this._checking = false;
		}
	});

	module.exports = Extension.api();
});