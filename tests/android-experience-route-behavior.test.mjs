import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { transformSync } from "esbuild";
import { parseAndroidShellPath } from "../lib/android-shell-app-routes.ts";

const shell = readFileSync(new URL("../mobile-offline-src/main.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("shell.tsx", shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function actualShellNavigation(initial) {
  let declaration;
  function find(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "applyShellPath") declaration = node;
    ts.forEachChild(node, find);
  }
  find(tree);
  assert.ok(declaration);
  const js = ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function("parseAndroidShellPath", "initial", `
    let screen = initial;
    const auth = { status: "signed-in" };
    const setScreen = (next) => { screen = next; };
    ${js}
    return { navigate: applyShellPath, current: () => screen, setScreen };
  `)(parseAndroidShellPath, initial);
}

function renderedExperienceDetail(screen, onBack) {
  const start = shell.indexOf('{screen.kind === "experience-detail" ? screen.returnTo');
  const end = shell.indexOf('{screen.kind === "guides" ?', start);
  assert.ok(start > 0 && end > start);
  const fragment = shell.slice(start, end);
  const transformed = transformSync(`function render(screen, setScreen) { return (<React.Fragment>${fragment}</React.Fragment>); }`, {
    loader: "tsx", format: "cjs", jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment",
  }).code;
  const ExperienceCardContent = function ExperienceCardContent() {};
  const AndroidExperienceCardDetail = function AndroidExperienceCardDetail() {};
  const render = new Function("React", "ExperienceCardContent", "AndroidExperienceCardDetail", `${transformed}; return render;`)(React, ExperienceCardContent, AndroidExperienceCardDetail);
  const tree = render(screen, onBack);
  return React.Children.toArray(tree.props.children).find((child) => child?.props?.onBack);
}

test("personal and public experience routes remain distinct and their detail back handlers return to the originating list", () => {
  assert.deepEqual(parseAndroidShellPath("/experience"), { kind: "experience" });
  assert.deepEqual(parseAndroidShellPath("/experience-cards"), { kind: "my-experience" });
  assert.notEqual(parseAndroidShellPath("/experience").kind, parseAndroidShellPath("/experience-cards").kind);

  const navigation = actualShellNavigation({ kind: "profile" });
  assert.equal(navigation.navigate("/experience-cards"), true);
  assert.equal(navigation.current().kind, "my-experience");
  navigation.navigate("/experience-cards/card-1");
  assert.deepEqual(navigation.current(), { kind: "experience-detail", id: "card-1", returnTo: "my-experience" });
  const personal = renderedExperienceDetail(navigation.current(), navigation.setScreen);
  assert.equal(personal.type.name, "ExperienceCardContent");
  personal.props.onBack();
  assert.equal(navigation.current().kind, "my-experience");

  navigation.navigate("/experience");
  assert.equal(navigation.current().kind, "experience");
  navigation.navigate("/experience-cards/card-2");
  const publicDetail = renderedExperienceDetail(navigation.current(), navigation.setScreen);
  assert.equal(publicDetail.type.name, "AndroidExperienceCardDetail");
  publicDetail.props.onBack();
  assert.equal(navigation.current().kind, "experience");
});
