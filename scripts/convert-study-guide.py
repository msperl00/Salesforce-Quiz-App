"""Extract chapters and glossary from the supplied HTML guide without its scripts."""
import argparse
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re

VOID = {"br", "hr", "input", "meta", "link", "img"}
ALLOWED = {"div", "p", "span", "b", "strong", "i", "em", "small", "code", "pre", "br", "hr",
           "h2", "h3", "h4", "ul", "ol", "li", "details", "summary", "table", "thead", "tbody", "tr", "th", "td", "a"}
DROP = {"script", "style", "iframe", "object", "embed", "svg", "form", "input", "button", "link", "meta"}


class Node:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return "".join(child if isinstance(child, str) else child.text() for child in self.children)

    def find(self, predicate):
        if predicate(self):
            return self
        for child in self.children:
            if isinstance(child, Node):
                found = child.find(predicate)
                if found is not None:
                    return found


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def sanitize(node):
    if isinstance(node, str):
        return escape(node)
    classes = node.attrs.get("class", "").split()
    if node.tag in DROP or "done" in classes or "next" in classes or "topic-h" in classes:
        return ""
    body = "".join(sanitize(child) for child in node.children)
    if node.tag not in ALLOWED:
        return body
    attrs = {}
    for key in ("class", "id", "title"):
        if key in node.attrs:
            attrs[key] = node.attrs[key]
    if node.tag in {"td", "th"} and re.fullmatch(r"[1-9][0-9]?", node.attrs.get("colspan", "")):
        attrs["colspan"] = node.attrs["colspan"]
    if node.tag == "details" and "open" in node.attrs:
        attrs["open"] = ""
    if node.tag == "a":
        href = node.attrs.get("href", "")
        if re.fullmatch(r"#[A-Za-z0-9_-]+", href) or re.match(r"^https://[^\s]+$", href):
            attrs["href"] = href
            if href.startswith("https://"):
                attrs.update(target="_blank", rel="noopener noreferrer")
    opening = "<" + node.tag + "".join(f' {key}="{escape(value, quote=True)}"' for key, value in attrs.items()) + ">"
    result = opening if node.tag in VOID else opening + body + f"</{node.tag}>"
    return '<div class="guide-table-scroll" tabindex="0">' + result + "</div>" if node.tag == "table" else result


def convert(path):
    source = path.read_text(encoding="utf-8")
    tree = Tree()
    tree.feed(source)
    main = tree.root.find(lambda node: node.tag == "main")
    if main is None:
        raise ValueError("La guía no contiene un cuerpo main.")
    section_nodes = []

    def collect(node):
        if node.tag == "section":
            section_nodes.append(node)
        else:
            for child in node.children:
                if isinstance(child, Node):
                    collect(child)
    collect(main)
    glossary_match = re.search(r"const GL = (\[.*?\]);", source, re.S)
    if not glossary_match:
        raise ValueError("No se encontró el glosario estructurado.")
    glossary = [{"term": item["t"], "definition": item["d"], "aliases": item["v"]}
                for item in json.loads(glossary_match[1])]
    sections = []
    special = {"inicio": "Cómo usar la guía", "ideas": "Ideas fundamentales", "chuleta": "Tablas rápidas", "examen": "Para el día del examen"}
    for node in section_nodes:
        slug = node.attrs.get("id", "")
        if slug == "glosario":
            continue
        heading = node.find(lambda item: item.tag in {"h1", "h2"})
        title = special.get(slug, heading.text().strip() if heading else "")
        subtitle = node.find(lambda item: item.tag == "p" and "sub" in item.attrs.get("class", "").split())
        topic = "topic" in node.attrs.get("class", "").split()
        # Heading and chapter controls are rendered by Vue, rather than copied.
        children = [child for child in node.children if child is not heading and child is not subtitle]
        html = "".join(sanitize(child) for child in children)
        if slug == "inicio":
            html = html.replace("Pasa el ratón (o toca en el móvil) cualquier término subrayado, por ejemplo Change Data Capture, para ver su significado.",
                                "Consulta las definiciones en la pestaña Glosario.")
            html = re.sub(r"<li><b>Haz su Daypo\.</b>.*?</li>",
                          "<li><b>Practica el tema.</b> Usa el botón de preguntas al final de cada capítulo para comprobar lo aprendido.</li>", html, flags=re.S)
        sections.append({"slug": slug, "title": title, "subtitle": subtitle.text().strip() if subtitle else "",
                         "kind": "topic" if topic else "reference", "tag": title if topic else "", "html": html.strip()})
    if len([section for section in sections if section["kind"] == "topic"]) != 14 or len(glossary) != 189:
        raise ValueError("La estructura de la guía ha cambiado; revisa los capítulos y el glosario.")
    return {"version": 1, "title": "Guía de Integration Architect", "sourceName": path.name,
            "importedAt": datetime.now(timezone.utc).isoformat(), "sections": sections, "glossary": glossary}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = convert(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sections": len(data["sections"]), "topics": 14, "glossary": len(data["glossary"]), "output": str(args.output)}))
