/*
 * XmlParser
 * This is a javascript port of Haxe's xml parser
 * https://github.com/HaxeFoundation/haxe/blob/3.4.7/std/haxe/xml/Parser.hx
 */
"use strict";

const IGNORE_SPACES = 0;
const BEGIN			= 1;
const BEGIN_NODE	= 2;
const TAG_NAME		= 3;
const BODY			= 4;
const ATTRIB_NAME	= 5;
const EQUALS		= 6;
const ATTVAL_BEGIN	= 7;
const ATTRIB_VAL	= 8;
const CHILDS		= 9;
const CLOSE			= 10;
const WAIT_END		= 11;
const WAIT_END_RET	= 12;
const PCDATA		= 13;
const HEADER		= 14;
const COMMENT		= 15;
const DOCTYPE		= 16;
const CDATA			= 17;
const ESCAPE		= 18;

const escapes = new Map();
escapes.set("lt", "<");
escapes.set("gt", ">");
escapes.set("amp", "&");
escapes.set("quot", '"');
escapes.set("apos", "'");

const $err = (msg, str, pos) => {
	return msg + "\n[" + pos + "] ..." + str.substr(pos - 20,20);
};

class XmlParser
{

/**
 * Parses the String into a Json object. Set strict parsing to true 
 * in order to enable a strict check of XML attributes and entities.
 */
	parse(str, strict=false)
	{
		const doc = {};
		this._parse(str, strict, 0, doc);
		return doc;
	}

	_parse(str, strict, p=0, parent=null)
	{
		let xml = null;
		let state = BEGIN;
		let next = BEGIN;
		let aname = null;
		let start = 0;
		let nsubs = 0;
		let nbrackets = 0;
		let c = str.charAt(p); 
		let buf = [];
		// need extra state because next is in use
		let escapeNext = BEGIN;
		let attrValQuote = -1;
		
		function addChild(xml) {
			// $ = children
			if (!parent.$) parent.$ = [];
			parent.$.push(xml);
			nsubs++;
		}
		
		const len = str.length; 

		while (p < len)	{
			switch(state){
				case IGNORE_SPACES:
					switch(c){
						case '\n':
						case '\r':
						case '\t':
						case ' ':{};break;
						default:
							state = next;
							continue;
					};
					break;
				case BEGIN:
					switch(c){
						case '<':
							state = IGNORE_SPACES;
							next = BEGIN_NODE;
							break;
						default:
							start = p;
							state = PCDATA;
							continue;
					}
					break;
				case PCDATA:
					if (c === '<' ){
						buf.push(str.substr(start, p - start));
						let child = {type: 'PCData', data: buf.join('')};
						buf = [];
						addChild(child);
						state = IGNORE_SPACES;
						next = BEGIN_NODE;
					}else if (c === '&' ) {
						buf.push(str.substr(start, p - start));
						state = ESCAPE;
						escapeNext = PCDATA;
						start = p + 1;
					};
					break;
				case CDATA:
					if (c === ']'  && str.charAt(p + 1) === ']'  && str.charAt(p + 2) === '>' ){
						let child = {type:'CData',data: str.substr(start, p - start)};
						addChild(child);
						p += 2;
						state = BEGIN;
					};
					break;
				case BEGIN_NODE:
					switch(c){
						case '!' :
							if (str.charAt(p + 1) === '[' ){
								p += 2;
								if (str.substr(p, 6).toUpperCase() !== "CDATA[")
									throw new Error($err("Expected <![CDATA[", str, p));
								p += 5;
								state = CDATA;
								start = p + 1;
							}else if (str.charAt(p + 1).toUpperCase() === 'D'){
								if(str.substr(p + 2, 6).toUpperCase() != "OCTYPE")
									throw new Error($err("Expected <!DOCTYPE", str, p));
								p += 8;
								state = DOCTYPE;
								start = p + 1;
							}else if( str.charAt(p + 1) !== '-'  || str.charAt(p + 2) !== '-'){
								throw new Error($err("Expected <!--", str, p));
							}else{
								p += 2;
								state = COMMENT;
								start = p + 1;
							};
							break;
						case '?' :
							state = HEADER;
							start = p;
							break;
						case '/' :
							if( parent === null )
								throw new Error($err("Expected node name", str, p));
							start = p + 1;
							state = IGNORE_SPACES;
							next = CLOSE;
							break;
						default:
							state = TAG_NAME;
							start = p;
							continue;
					}
					break;
				case TAG_NAME:
					if (!this.isValidChar(c)){
						if( p === start )
							throw new Error($err("Expected node name", str, p));
						xml = {type:'Element',name: str.substr(start, p - start)};
						addChild(xml);
						state = IGNORE_SPACES;
						next = BODY;
						continue;
					};
					break;
				case BODY:
					switch(c){
						case '/' :
							state = WAIT_END;
							break;
						case '>' :
							state = CHILDS;
							break;
						default:
							state = ATTRIB_NAME;
							start = p;
							continue;
					};
					break;
				case ATTRIB_NAME:
					if (!this.isValidChar(c)){
						let tmp;
						if( start === p )
							throw new Error($err("Expected attribute name",str,p));
						tmp = str.substr(start,p-start);
						aname = tmp;
						if (!xml.attr) xml.attr = {};
						if( xml.attr[aname] )
							throw new Error($err("Duplicate attribute [" + aname + "]", str, p));
						state = IGNORE_SPACES;
						next = EQUALS;
						continue;
					};
					break;
				case EQUALS:
					switch(c){
						case '=' :
							state = IGNORE_SPACES;
							next = ATTVAL_BEGIN;
							break;
						default:
							throw new Error($err("Expected '='",str,p));
					};
					break;
				case ATTVAL_BEGIN:
					switch(c){
						case '"':
						case "'":
							buf = [];
							state = ATTRIB_VAL;
							start = p + 1;
							attrValQuote = c;
							break;
						default:
							throw new Error($err('Expected "', str, p));
					};
					break;
				case ATTRIB_VAL:
					switch (c){
						case '&' :
							buf.push(str.substr(start, p - start));
							state = ESCAPE;
							escapeNext = ATTRIB_VAL;
							start = p + 1;
							break;
						case '>':
						case '<':
							if( strict ){
							// HTML allows these in attributes values
								throw new Error($err("Invalid unescaped '" + 
									c + "' in attribute value", str, p));
							}
							break;
						default: 
							if (c === attrValQuote){
								buf.push(str.substr(start, p - start));
								xml.attr[aname] = buf.join('');
								buf = [];
								state = IGNORE_SPACES;
								next = BODY;
							}
					};
					break;
				case CHILDS:
					p = this._parse(str, strict, p, xml);
					start = p;
					state = BEGIN;
					break;
				case WAIT_END:
					switch(c){
						case '>' :
							state = BEGIN;
							break;
						default :
							throw new Error($err("Expected '>'", str, p));
					};
					break;
				case WAIT_END_RET:
					switch(c){
						case '>' :
							if( nsubs == 0 ){
								if (!parent.$) parent.$ = [];
								parent.$.push({type:'PCData',data:""});
							}
							return p;
						default :
							throw new Error($err("Expected '>'", str, p));
					}
					break;
				case CLOSE:
					if (!this.isValidChar(c)){
						if( start === p )
							throw new Error($err("Expected node name", str, p));

						let v = str.substr(start,p - start);
						if (v !== parent.name)
							throw new Error($err("Expected '</" +parent.name + ">'", str, p));

						state = IGNORE_SPACES;
						next = WAIT_END_RET;
						continue;
					};
					break;
				case COMMENT:
					if (c === '-'  && str.charAt(p +1) === '-'  && str.charAt(p + 2) === '>'){
						addChild({type:'Comment',data: str.substr(start, p - start)});
						p += 2;
						state = BEGIN;
					};
					break;
				case DOCTYPE:
					if(c === '[' )
						nbrackets++;
					else if(c === ']' )
						nbrackets--;
					else if (c === '>'  && nbrackets === 0)
					{
						addChild({type:'DocType',data: str.substr(start, p - start)});
						state = BEGIN;
					};
					break;
				case HEADER:
					if (c === '?'  && str.charAt(p + 1) === '>' ){
						p++;
						let str = str.substr(start + 1, p - start - 2);
						addChild({type:'ProcessingInstruction',data: str});
						state = BEGIN;
					};
					break;
				case ESCAPE:
					if (c === ';'){
						let s = str.substr(start, p - start);
						if (s.charAt(0) === '#') {
							let c = s.charAt(1) === 'x' 
								? parseInt("0" +s.substr(1, s.length - 1))
								: parseInt(s.substr(1, s.length - 1));
							buf.push(c);
						}else if (!escapes.has(s)) {
							if( strict )
								throw new Error($err("Undefined entity: " + s, str, p));
							buf.push('&' + s + ';');
						}else{
							buf.push(escapes.get(s));
						}
						start = p + 1;
						state = escapeNext;
					} else if (!this.isValidChar(c) && c !== "#" ) {
						if( strict )
							throw new Error($err("Invalid character in entity: " + c, str, p));
						buf.push("&");
						buf.push(str.substr(start, p - start));
						p--;
						start = p + 1;
						state = escapeNext;
					};
					break;
			}
			c = str.charAt(++p);
		}

		if (state === BEGIN){
			start = p;
			state = PCDATA;
		}

		if (state === PCDATA){
			if (p !== start || nsubs === 0) {
				buf.push(str.substr(start, p-start));
				addChild({type:'PCData',data:  buf.join('')});
			}
			return p;
		}

		if( !strict && state === ESCAPE && escapeNext === PCDATA ) {
			buf.push("&");
			buf.push(str.substr(start, p - start));
			addChild({type:'PCData', data: buf.join('')});
			return p;
		}

		throw new Error($err("Unexpected end", str, p));
	}

	isValidChar(s) 
	{
		const c = s.charCodeAt(0);
		return (c >= 97  && c <= 122 ) || // a - z
			(c >= 65  && c <= 90 ) || // A - Z
			(c >= 48  && c <= 57 ) || // 0 - 9
			s === ':'  || s === '.'  || 
			s === '_'  || s === '-' ;
	}
	
}

module.exports = XmlParser;
