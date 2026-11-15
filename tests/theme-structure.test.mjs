// Checks that the theme's files point at each other correctly. Theme Check runs
// Shopify's own rules in CI. These tests cover the links Theme Check does not check,
// such as a template that names a section file that does not exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const listFiles = (dir, ext) =>
  readdirSync(join(root, dir)).filter((name) => name.endsWith(ext));

const sectionFiles = listFiles('sections', '.liquid');
const snippetNames = listFiles('snippets', '.liquid').map((f) => f.replace(/\.liquid$/, ''));
const assetNames = readdirSync(join(root, 'assets'));

function schemaOf(sectionName) {
  const source = read('sections', `${sectionName}.liquid`);
  const match = source.match(/{% schema %}([\s\S]*?){% endschema %}/);
  return match ? JSON.parse(match[1]) : null;
}

function allLiquidSources() {
  return [
    ...['layout', 'sections', 'snippets'].flatMap((dir) =>
      listFiles(dir, '.liquid').map((name) => ({ name: `${dir}/${name}`, source: read(dir, name) })),
    ),
  ];
}

test('every JSON template is valid and lists every section in its order', () => {
  for (const name of listFiles('templates', '.json')) {
    const template = JSON.parse(read('templates', name));
    for (const key of Object.keys(template.sections)) {
      assert.ok(template.order.includes(key), `${name}: section "${key}" is missing from order`);
    }
    for (const key of template.order) {
      assert.ok(template.sections[key], `${name}: order lists unknown section "${key}"`);
    }
  }
});

test('every section used by a template has a file and a schema', () => {
  for (const name of listFiles('templates', '.json')) {
    const template = JSON.parse(read('templates', name));
    for (const [key, section] of Object.entries(template.sections)) {
      const schema = schemaOf(section.type);
      assert.ok(schema, `${name}: section "${key}" uses "${section.type}", which has no schema`);
    }
  }
});

test('template setting and block values match the section schema', () => {
  for (const name of listFiles('templates', '.json')) {
    const template = JSON.parse(read('templates', name));
    for (const [key, section] of Object.entries(template.sections)) {
      const schema = schemaOf(section.type);
      const settingIds = new Set((schema.settings || []).map((s) => s.id));
      for (const settingName of Object.keys(section.settings || {})) {
        assert.ok(settingIds.has(settingName), `${name}: "${key}" sets unknown setting "${settingName}"`);
      }
      const blockTypes = new Set((schema.blocks || []).map((b) => b.type));
      for (const [blockKey, block] of Object.entries(section.blocks || {})) {
        assert.ok(blockTypes.has(block.type), `${name}: "${key}" block "${blockKey}" has unknown type "${block.type}"`);
        const blockSchema = schema.blocks.find((b) => b.type === block.type);
        const blockSettingIds = new Set((blockSchema.settings || []).map((s) => s.id));
        for (const settingName of Object.keys(block.settings || {})) {
          assert.ok(blockSettingIds.has(settingName), `${name}: block "${blockKey}" sets unknown setting "${settingName}"`);
        }
      }
    }
  }
});

test('section schemas have unique setting ids', () => {
  for (const file of sectionFiles) {
    const schema = schemaOf(file.replace(/\.liquid$/, ''));
    if (!schema) continue;
    const ids = (schema.settings || []).map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${file} has duplicate setting ids`);
  }
});

test('Liquid section.settings references exist in the schema', () => {
  for (const file of sectionFiles) {
    const name = file.replace(/\.liquid$/, '');
    const schema = schemaOf(name);
    const ids = new Set((schema?.settings || []).map((s) => s.id));
    const source = read('sections', file).replace(/{% schema %}[\s\S]*?{% endschema %}/, '');
    for (const [, settingName] of source.matchAll(/section\.settings\.(\w+)/g)) {
      assert.ok(ids.has(settingName), `sections/${file} reads unknown setting "${settingName}"`);
    }
  }
});

test('every render, section and asset reference points at a real file', () => {
  for (const { name, source } of allLiquidSources()) {
    for (const [, snippet] of source.matchAll(/{%-?\s*render\s+'([^']+)'/g)) {
      assert.ok(snippetNames.includes(snippet), `${name} renders missing snippet "${snippet}"`);
    }
    for (const [, section] of source.matchAll(/{%-?\s*section\s+'([^']+)'/g)) {
      assert.ok(sectionFiles.includes(`${section}.liquid`), `${name} includes missing section "${section}"`);
    }
    for (const [, asset] of source.matchAll(/'([^']+)'\s*\|\s*asset_url/g)) {
      assert.ok(assetNames.includes(asset), `${name} links missing asset "${asset}"`);
    }
  }
});

test('config JSON files parse', () => {
  JSON.parse(read('config', 'settings_schema.json'));
  JSON.parse(read('config', 'settings_data.json'));
});
