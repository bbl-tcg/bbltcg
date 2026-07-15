import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const parserOptions = {
  ignoreAttributes: true,
  preserveOrder: true,
  trimValues: false,
  textNodeName: "#text",
};

/** Load word/document.xml out of a .docx and parse it in document order. */
export function loadDocumentXml(docxPath) {
  const zip = new AdmZip(docxPath);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error(`word/document.xml not found in ${docxPath}`);
  const xml = zip.readAsText(entry, "utf8");
  const parser = new XMLParser(parserOptions);
  return parser.parse(xml);
}

/** Depth-first collect all #text leaves under a preserveOrder node array, in document order. */
function collectText(nodes, out) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node["#text"] !== undefined) {
      out.push(String(node["#text"]));
      continue;
    }
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      collectText(node[key], out);
    }
  }
}

export function textOf(nodes) {
  const out = [];
  collectText(nodes, out);
  return out.join("");
}

/** Find all descendant nodes with a given tag name, in document order (does not recurse into matches). */
export function findAll(nodes, tag, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const node of nodes) {
    if (node[tag] !== undefined) {
      out.push(node[tag]);
      continue;
    }
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      findAll(node[key], tag, out);
    }
  }
  return out;
}

/** Given a w:body node array, return a list of tables, each a list of rows, each a list of cell text strings. */
export function extractTables(bodyNodes) {
  const tableNodes = findAll(bodyNodes, "w:tbl");
  return tableNodes.map((tblChildren) => {
    const rowNodes = findAll(tblChildren, "w:tr");
    return rowNodes.map((rowChildren) => {
      const cellNodes = findAll(rowChildren, "w:tc");
      return cellNodes.map((cellChildren) => textOf(cellChildren).trim());
    });
  });
}

export function getBody(parsedDoc) {
  const docNode = parsedDoc.find((n) => n["w:document"]);
  const body = docNode["w:document"].find((n) => n["w:body"]);
  return body["w:body"];
}

/** Walk the direct (top-level) children of w:body in document order, as paragraph/table blocks. */
export function walkBodyBlocks(bodyNodes) {
  const blocks = [];
  for (const node of bodyNodes) {
    if (node["w:p"] !== undefined) {
      blocks.push({ type: "p", text: textOf(node["w:p"]).trim() });
    } else if (node["w:tbl"] !== undefined) {
      const rowNodes = findAll(node["w:tbl"], "w:tr");
      const rows = rowNodes.map((rowChildren) => {
        const cellNodes = findAll(rowChildren, "w:tc");
        return cellNodes.map((cellChildren) => textOf(cellChildren).trim());
      });
      blocks.push({ type: "tbl", rows });
    }
  }
  return blocks;
}
