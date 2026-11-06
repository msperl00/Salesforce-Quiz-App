"""Convert this Daypo folder layout to the app's JSON import format (Python 3)."""

import argparse
import base64
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET


def read_test(path):
    root = ET.parse(path).getroot()
    if root.tag != "test" or root.find("c") is None:
        raise ValueError(f"Formato Daypo no reconocido: {path.name}")
    return root.findtext("./p/t", ""), root.findall("./c/c")


def question_key(question):
    # Several scenarios share a prompt but have different answer options.
    return (
        question.findtext("p", ""),
        tuple(option.text or "" for option in question.findall("./r/o")),
        question.findtext("c", ""),
    )


def convert(source):
    exam_name, source_questions = read_test(source / "Daypo_Completo.xml")
    if not exam_name.strip() or not source_questions:
        raise ValueError("El banco no tiene nombre o preguntas.")
    assignments = {}
    for path in sorted((source / "Daypo por temas").glob("*.xml")):
        title, questions = read_test(path)
        topic = title.removeprefix("Integration Architect - ").strip()
        if not topic:
            raise ValueError(f"Tema sin título: {path.name}")
        for question in questions:
            key = question_key(question)
            if key in assignments:
                raise ValueError(f"Pregunta asignada a más de un tema: {path.name}")
            assignments[key] = topic
    keys = [question_key(question) for question in source_questions]
    if len(set(keys)) != len(keys) or set(keys) != set(assignments):
        raise ValueError("Los temas y el banco general no contienen las mismas preguntas.")

    questions = []
    for number, question in enumerate(source_questions, 1):
        prompt, options, code = question_key(question)
        # Daypo type 0 is multiple choice; 1 = distractor, 2 = correct option.
        if question.findtext("t") != "0" or len(code) != len(options) or set(code) - {"1", "2"}:
            raise ValueError(f"Tipo o clave de respuesta no reconocido en P{number:03}.")
        if not prompt.strip() or len(options) < 2 or any(not option.strip() for option in options) or "2" not in code:
            raise ValueError(f"Pregunta incompleta en P{number:03}.")
        image_data_url = ""
        diagram = re.match(r"^\[Ver diagrama ([A-Za-z0-9_-]+)\]\s*", prompt)
        if "[Ver diagrama" in prompt and not diagram:
            raise ValueError(f"Referencia de diagrama no reconocida en P{number:03}.")
        if diagram:
            image = (source / "Daypo - diagramas" / f"{diagram[1]}.png").read_bytes()
            if not image.startswith(b"\x89PNG\r\n\x1a\n") or len(image) > 2 * 1024 * 1024:
                raise ValueError(f"Diagrama PNG inválido o demasiado grande: {diagram[1]}")
            image_data_url = "data:image/png;base64," + base64.b64encode(image).decode("ascii")
            prompt = prompt[diagram.end():]
        questions.append({
            "prompt": prompt.strip(),
            "imageDataUrl": image_data_url,
            "explanation": question.findtext("h", "").strip(),
            "note": f"Origen: Daypo · P{number:03}",
            "tags": [assignments[question_key(question)]],
            "answers": [{"text": text.strip(), "isCorrect": digit == "2"} for text, digit in zip(options, code)],
        })
    return {"version": 1, "examName": exam_name.strip(),
            "exportedAt": datetime.now(timezone.utc).isoformat(), "questions": questions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Carpeta Daypos")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = convert(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    # Each file also works with the existing browser import (100 questions / 3 MB).
    chunks, chunk = [], []
    for question in data["questions"]:
        candidate = {**data, "questions": chunk + [question]}
        if chunk and (len(chunk) == 100 or len(json.dumps(candidate, ensure_ascii=False, indent=2).encode()) > 3_000_000):
            chunks.append(chunk)
            chunk = []
        chunk.append(question)
    if chunk:
        chunks.append(chunk)
    for index, questions in enumerate(chunks, 1):
        path = args.output / f"integration-architect-{index:02}.json"
        raw = json.dumps({**data, "questions": questions}, ensure_ascii=False, indent=2) + "\n"
        if len(raw.encode()) > 3_000_000:
            raise ValueError("Una pregunta supera el límite de importación de 3 MB.")
        path.write_text(raw, encoding="utf-8")
        print(f"{path}: {len(questions)} preguntas")
    print(json.dumps({"questions": len(data["questions"]),
                      "images": sum(bool(q["imageDataUrl"]) for q in data["questions"]),
                      "topics": dict(Counter(q["tags"][0] for q in data["questions"]))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
