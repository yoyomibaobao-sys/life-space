import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("My Space owner cards have a single-line ellipsis title with privacy and help in the second row", () => {
  const component = read("components/project/ProjectSummaryCard.tsx");
  const css = read("components/project/ProjectSummaryCard.module.css");
  const wrapper = read("components/archive-ui/ArchiveProjectCard.tsx");

  assert.match(wrapper, /<ProjectSummaryCard[\s\S]*compactOwnerHeader/);
  assert.match(component, /data-compact-owner-header=\{props\.compactOwnerHeader \? "true" : undefined\}/);
  const start = component.indexOf("props.compactOwnerHeader ? (");
  const end = component.indexOf(") : (", start);
  assert.ok(start > 0 && end > start);
  const header = component.slice(start, end);
  assert.match(header, /data-project-owner-compact-header="true"/);
  const firstRowTitle = header.indexOf("<strong className={styles.title}");
  const firstRowAction = header.indexOf("{actionNode}");
  const secondRowVisibility = header.indexOf("styles.compactVisibilityRow");
  const secondRowHelp = header.indexOf("styles.compactHelpRow");
  assert.ok(firstRowTitle < firstRowAction && firstRowAction < secondRowVisibility && secondRowVisibility < secondRowHelp);
  assert.match(header, /{visibilityNode}/);
  assert.match(header, /{props\.helpLabel \? <span className={styles\.help}>/);
  assert.match(css, /\.compactTitleGrid\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) max-content/);
  assert.match(css, /\.compactTitleGrid \.title\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /\.compactVisibilityRow\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*2;/);
  assert.match(css, /\.compactHelpRow\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*2;/);
  assert.match(component, /<strong className=\{styles\.title\} title=\{props\.title\}>/);
  assert.match(component, /ariaLabel: string/);
});

test("Only My Space mobile header spacing shrinks, without shrinking controls or changing sticky top offsets", () => {
  const userHeader = read("components/archive-ui/PersonalSpaceMobileIdentity.tsx");
  const sources = read("components/archive-ui/ArchiveSourceSwitcher.tsx");
  const taxonomy = read("components/archive-ui/ArchiveTaxonomyPanel.tsx");
  const web = read("app/globals.css");
  const bundled = read("mobile-offline-src/offline.css");
  assert.match(userHeader, /marginBottom:\s*5/);
  assert.match(sources, /sourceSwitchStyle\(Boolean\(trailingSlot\), packVisibleSources\)/);
  assert.match(sources, /margin:\s*packedMobile \? "0 0 7px" : "0 0 12px"/);
  assert.match(taxonomy, /marginBottom:\s*compact \? 5 : 18/);
  for (const css of [web,bundled]) {
    assert.match(css, /\.ls-sticky-workspace-controls[\s\S]*top:\s*calc\(50px \+ var\(--app-safe-area-top, 0px\)\);/);
    assert.match(css, /\.ls-sticky-workspace-controls[\s\S]*padding:\s*2px 0;/);
  }
  const filter = read("components/ui/CategoryFilterRow.module.css");
  const guides = read("components/plant/GuideCategoryTabs.module.css");
  assert.match(filter, /\.sticky\s*\{[\s\S]*padding:\s*3px 0;/);
  assert.match(filter, /min-height:\s*40px/);
  assert.match(guides, /\.tabs \{ padding:\s*3px 0; margin-bottom:\s*6px; \}/);
});
