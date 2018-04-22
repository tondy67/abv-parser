/**
 * Test XmlParser
 */
"use strict";

const fs = require('fs');
const { XmlParser } = require('../index.js');

const parser = new XmlParser();

const src = ['Rect.svg','test.xml','index.html','bg.html'];
let f = null, xml=null;

console.log('Begin test...');

let name = '';
try{
	for (name of src){
		f = fs.readFileSync(__dirname + '/' + name,'utf8');
		xml = null; 
		xml =  parser.parse(f, true);
		if (xml) console.log('Parsed: ' + name);
	}
}catch(e){ console.error("[" + name + "] " + e);}
