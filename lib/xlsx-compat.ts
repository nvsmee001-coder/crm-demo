const SHEET_XML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const recognizedNamespaces = new Set([SHEET_XML, PACKAGE_REL, CONTENT_TYPES]);

function escapeText(value: string) {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function escapeAttribute(value: string) {
  return escapeText(value).replaceAll('"','&quot;').replaceAll('\t','&#9;').replaceAll('\n','&#10;').replaceAll('\r','&#13;');
}

/**
 * ExcelJS recognizes these workbook parts by lexical XML names. Normalize only
 * known namespaces in memory so equivalent prefixed files use the same reader.
 */
export async function compatibleXlsx(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const [{ default: JSZip }, { SaxesParser }] = await Promise.all([import('jszip'), import('saxes')]);
  const zip = await JSZip.loadAsync(buffer);
  let modified = false;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/^(?:\[Content_Types\]\.xml|_rels\/\.rels|xl\/.*\.(?:xml|rels))$/.test(entry.name)) continue;
    const xml = await entry.async('string');
    if (!/<\/?[^\s/:<>]+:[^\s/:<>]+(?=[\s/>])/.test(xml) && !xml.includes(OFFICE_REL)) continue;
    const output: string[] = [];
    const tags: { name: string; defaultNamespace: string }[] = [];
    let changed = false;
    const parser = new SaxesParser({ xmlns:true });
    parser.on('doctype',()=>{ throw new Error('Unsupported document type in Excel XML.'); });
    parser.on('opentag',tag=>{
      const name = recognizedNamespaces.has(tag.uri) ? tag.local : tag.name;
      const attributes = new Map(Object.values(tag.attributes).map(attr=>[attr.name,attr.value]));
      let defaultNamespace = attributes.get('xmlns') ?? tags.at(-1)?.defaultNamespace ?? '';
      if (!name.includes(':') && defaultNamespace !== tag.uri) {
        attributes.set('xmlns',tag.uri);
        defaultNamespace=tag.uri;
      }
      for (const attr of Object.values(tag.attributes)) {
        if (attr.uri!==OFFICE_REL || attr.prefix==='r') continue;
        attributes.delete(attr.name);
        attributes.set('r:'+attr.local,attr.value);
        attributes.set('xmlns:r',OFFICE_REL);
        changed=true;
      }
      changed ||= name!==tag.name;
      tags.push({name,defaultNamespace});
      output.push('<',name);
      for (const [key,value] of attributes) output.push(' ',key,'="',escapeAttribute(value),'"');
      output.push(tag.isSelfClosing?'/>' : '>');
    });
    parser.on('closetag',tag=>{
      const current = tags.pop()!;
      if (!tag.isSelfClosing) output.push('</',current.name,'>');
    });
    parser.on('text',text=>output.push(escapeText(text)));
    parser.on('cdata',text=>output.push(escapeText(text)));
    parser.write(xml).close();
    if (!changed) continue;
    zip.file(entry.name,output.join(''));
    modified=true;
  }
  return modified ? zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'}) : buffer;
}
