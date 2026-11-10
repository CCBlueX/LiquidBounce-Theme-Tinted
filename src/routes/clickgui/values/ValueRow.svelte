<script lang="ts">
  import { tick } from "svelte";
  import { request } from "../../../lib/api/client";
  import { player } from "../../../lib/api/routes";
  import type { FileDialogResult, JsonValue, MultiChooseValue, Vec2, Vec3 } from "../../../lib/api/types";
  import { play } from "../../../lib/sound";
  import ItemIcon from "../../../lib/ui/ItemIcon.svelte";
  import Segmented from "../../../lib/ui/Segmented.svelte";
  import Slider from "../../../lib/ui/Slider.svelte";
  import Switch from "../../../lib/ui/Switch.svelte";
  import type { SettingsEditor } from "../editor.svelte";
  import { formatRanged, humanize, idName, pathKey, stepOf, type Item } from "../tree";
  import Chooser from "./Chooser.svelte";
  import ColorField from "./ColorField.svelte";
  import CurveEditor from "./CurveEditor.svelte";
  import KeyRecorder from "./KeyRecorder.svelte";
  import RegistryList from "./RegistryList.svelte";
  import RegistryPicker from "./RegistryPicker.svelte";

  // One row of the settings list for every value type that is not a group
  let { item, editor }: { item: Item; editor: SettingsEditor } = $props();

  const node = $derived(item.node);
  const label = $derived(humanize(node.name));
  const key = $derived(pathKey(item.trail, node.name));
  const set = (value: JsonValue, delay = 0) => editor.set(item.trail, node, value, delay);

  function toggleChoice(value: MultiChooseValue, choice: string) {
    const on = value.value.includes(choice);
    if (on && value.value.length === 1 && !value.canBeNone) {
      play("error");
      return;
    }
    play("tap");
    set(on ? value.value.filter((entry) => entry !== choice) : [...value.value, choice]);
  }

  // A removed entry takes its focused button along; focus moves to the one that took its place, else the row's
  // first control
  async function removeAt<T>(list: T[], index: number, event: MouseEvent) {
    const row = (event.currentTarget as HTMLElement).closest(".cg-row");
    play("tap");
    set(list.filter((_, i) => i !== index) as JsonValue);
    await tick();
    const remaining = [...(row?.querySelectorAll<HTMLButtonElement>("[data-remove]:not(:disabled)") ?? [])];
    (remaining[Math.min(index, remaining.length - 1)] ?? row?.querySelector<HTMLElement>("input, button:not(:disabled)"))?.focus();
  }

  let draft = $state("");
  function addText(list: string[]) {
    const text = draft.trim();
    if (!text) return;
    if (list.includes(text)) {
      play("error");
      return;
    }
    play("confirm");
    draft = "";
    set([...list, text]);
  }

  function numberFrom(input: HTMLInputElement, int: boolean, min = -Infinity, max = Infinity): number | undefined {
    const parsed = int ? Math.round(Number(input.value)) : Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(parsed)) return undefined;
    return Math.min(max, Math.max(min, parsed));
  }

  function setAxis<V extends Vec2 | Vec3>(current: V, axis: keyof V & string, input: HTMLInputElement, int: boolean) {
    const next = numberFrom(input, int);
    if (next === undefined) {
      input.value = String(current[axis]);
      play("error");
      return;
    }
    input.value = String(next);
    if (next !== current[axis]) set({ ...current, [axis]: next } as JsonValue);
  }

  async function locate(int: boolean) {
    const data = await player.data().catch(() => undefined);
    if (!data) {
      play("error");
      return;
    }
    const pos = int ? data.blockPosition : data.position;
    play("confirm");
    set(int ? { x: pos.x, y: pos.y, z: pos.z } : { x: Number(pos.x.toFixed(2)), y: Number(pos.y.toFixed(2)), z: Number(pos.z.toFixed(2)) });
  }

  async function chooseFile(mode: "OPEN_FILE" | "SAVE_FILE" | "OPEN_DIRECTORY", extensions: string[] | undefined) {
    try {
      const result = await request<FileDialogResult | undefined>("POST", "/fileDialog", { body: { mode, supportedExtensions: extensions } });
      if (result?.file) {
        play("confirm");
        set(result.file);
      }
    } catch {
      play("error");
    }
  }

  function summary(value: JsonValue): string {
    if (Array.isArray(value)) return value.length === 1 ? "1 entry" : `${value.length} entries`;
    if (value === null) return "None";
    if (typeof value === "object") return `${Object.keys(value).length} fields`;
    return String(value);
  }
</script>

{#snippet field(text: string)}<span class="cg-label" id="label-{key}">{text}</span>{/snippet}

{#if node.valueType === "BOOLEAN"}
  <div class="cg-row" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <Switch checked={node.value} {label} onchange={(value) => set(value)} />
  </div>
{:else if node.valueType === "INT" || node.valueType === "FLOAT"}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-val">{formatRanged(node)}</span>
    <div class="cg-full">
      <Slider
        min={node.range.from}
        max={node.range.to}
        step={stepOf(node)}
        value={node.value}
        {label}
        onchange={(value) => set(value as number, 150)}
      />
    </div>
  </div>
{:else if node.valueType === "INT_RANGE" || node.valueType === "FLOAT_RANGE"}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-val">{formatRanged(node)}</span>
    <div class="cg-full">
      <Slider
        min={node.range.from}
        max={node.range.to}
        step={stepOf(node)}
        from={node.value.from}
        to={node.value.to}
        {label}
        onchange={(value) => set(value as JsonValue, 150)}
      />
    </div>
  </div>
{:else if node.valueType === "CHOOSE"}
  <div class="cg-row" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <Chooser options={node.choices} value={node.value} {label} onchange={(value) => set(value)} />
  </div>
{:else if node.valueType === "MULTI_CHOOSE"}
  {@const multi = node}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-val t-footnote">
      {multi.value.length} of {multi.choices.length}{multi.isOrderSensitive && multi.value.length > 1 ? ", in order" : ""}
    </span>
    <div class="cg-full cg-chips chips" role="group" aria-labelledby="label-{key}">
      {#each multi.choices as choice (choice)}
        {@const index = multi.value.indexOf(choice)}
        <button class="cg-chip" class:on={index >= 0} aria-pressed={index >= 0} onclick={() => toggleChoice(multi, choice)}>
          {#if index >= 0 && multi.isOrderSensitive}<span class="mark" aria-hidden="true">{index + 1}</span>{/if}
          <span class="ellipsis" title={choice}>{choice}</span>
        </button>
      {/each}
    </div>
  </div>
{:else if node.valueType === "COLOR"}
  <div class="cg-row" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <ColorField value={node.value} {label} onchange={(value, delay) => set(value, delay)} />
  </div>
{:else if node.valueType === "TEXT"}
  <div class="cg-row" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <input
      class="cg-field text"
      type={/password|token/i.test(node.name) ? "password" : "text"}
      value={node.value}
      spellcheck="false"
      aria-label={label}
      onchange={(event) => set(event.currentTarget.value)}
    />
  </div>
{:else if node.valueType === "BIND"}
  {@const bind = node.value}
  <div class="cg-row bind" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <KeyRecorder
      boundKey={bind.boundKey}
      modifiers={bind.modifiers}
      chords
      {label}
      onchange={(boundKey, modifiers) => set({ ...bind, boundKey, modifiers })}
    />
    <Segmented
      options={["Toggle", "Hold", "Smart"]}
      value={bind.action}
      label="{label} action"
      small
      onchange={(action) => set({ ...bind, action })}
    />
  </div>
{:else if node.valueType === "KEY"}
  <div class="cg-row" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <KeyRecorder boundKey={node.value} {label} emptyText="None" onchange={(value) => set(value)} />
  </div>
{:else if node.valueType === "FILE"}
  {@const file = node}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    {#if file.supportedExtensions?.length}
      {@const extensions = file.supportedExtensions.join(", ")}
      <span class="cg-hint extensions" title={extensions}>{extensions}</span>
    {/if}
    <div class="cg-full line">
      <input
        class="cg-field grow"
        value={file.value}
        placeholder="No file"
        spellcheck="false"
        aria-label="{label} path"
        onchange={(event) => set(event.currentTarget.value)}
      />
      <button class="cg-pill" onclick={() => chooseFile(file.dialogMode ?? "OPEN_FILE", file.supportedExtensions)}>Choose</button>
    </div>
  </div>
{:else if node.valueType === "MUTABLE_LIST"}
  {@const list = node.value}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-val t-footnote">{list.length === 1 ? "1 entry" : `${list.length} entries`}</span>
    <div class="cg-full cg-chips chips" role="list" aria-labelledby="label-{key}">
      {#each list as entry, index (index)}
        <span class="cg-chip on-text" role="listitem">
          <span class="ellipsis" title={entry}>{entry}</span>
          <button class="x" data-remove aria-label="Remove {entry}" onclick={(event) => removeAt(list, index, event)}>×</button>
        </span>
      {/each}
      <input
        class="cg-field add"
        bind:value={draft}
        placeholder="Add"
        spellcheck="false"
        aria-label="Add to {label}"
        onkeydown={(event) => event.key === "Enter" && addText(list)}
      />
    </div>
  </div>
{:else if node.valueType === "REGISTRY_LIST" || node.valueType === "REGISTRY_MUTABLE_LIST"}
  {@const list = node.value}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-val t-footnote">{list.length === 1 ? "1 entry" : `${list.length} entries`}</span>
    <RegistryPicker registryName={node.registry} {label} exclude={list} onpick={(id) => set([...list, id])} />
    <div class="cg-full">
      <RegistryList {list} registryName={node.registry} {label} onchange={(next) => set(next)} />
    </div>
  </div>
{:else if node.valueType === "CURVE"}
  {@const curve = node}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-val t-footnote">{curve.value.length} points</span>
    <div class="cg-full">
      <CurveEditor
        value={curve.value}
        xAxis={curve.xAxis}
        yAxis={curve.yAxis}
        tension={curve.tension}
        {label}
        onchange={(points: Vec2[], delay) => set(points, delay)}
      />
    </div>
  </div>
{:else if node.valueType === "VECTOR2_F" || node.valueType === "VECTOR3_D" || node.valueType === "VECTOR3_I"}
  {@const vector = node.value}
  {@const int = node.valueType === "VECTOR3_I"}
  {@const axes = (node.valueType === "VECTOR2_F" ? ["x", "y"] : ["x", "y", "z"]) as ("x" | "y" | "z")[]}
  <div class="cg-row stack" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    {#if node.valueType !== "VECTOR2_F" && node.useLocateButton}
      <button class="cg-pill quiet" onclick={() => locate(int)}>Use my position</button>
    {/if}
    <div class="cg-full axes" role="group" aria-labelledby="label-{key}">
      {#each axes as axis (axis)}
        <label class="axis">
          <span class="cg-hint">{axis.toUpperCase()}</span>
          <input
            class="cg-field"
            type="number"
            step={int ? 1 : "any"}
            value={(vector as Vec3)[axis]}
            aria-label="{label} {axis}"
            onchange={(event) => setAxis(vector as Vec3, axis, event.currentTarget, int)}
          />
        </label>
      {/each}
    </div>
  </div>
{:else if (node.valueType === "BLOCK" || node.valueType === "ITEM") && typeof node.value === "string"}
  {@const id = node.value}
  <div class="cg-row" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-chip on-text"><ItemIcon {id} size={16} fallback />{idName(id)}</span>
    <RegistryPicker
      registryName={node.valueType === "BLOCK" ? "block" : "item"}
      {label}
      exclude={[id]}
      buttonText="Change"
      onpick={(next) => set(next)}
    />
  </div>
{:else if node.valueType === "CONFIGURABLE" || node.valueType === "TOGGLEABLE" || node.valueType === "CHOICE"}
  <!-- Groups are drawn by Rows -->
{:else}
  <!-- Lists edited elsewhere in the client (friends, proxies, accounts, marketplace items): shown, not edited here -->
  <div class="cg-row" data-key={key} data-type={node.valueType}>
    {@render field(label)}
    <span class="cg-val">{summary(node.value)}</span>
  </div>
{/if}

<style>
  .chips { margin-top: 6px; }
  .on-text { color: var(--label); }
  .ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* The label keeps its width; a long list of file types gives way */
  .extensions { max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text { width: 160px; }
  .add { width: 88px; height: 24px; border-radius: 12px; }
  .line { display: flex; gap: 8px; align-items: center; }
  .grow { flex: 1; }
  .axes { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 6px; }
  .axis { display: flex; align-items: center; gap: 6px; }
  .axis input { flex: 1; width: 0; }
  /* A long chord pushes the action switch to a line of its own instead of squeezing the label */
  /* Recording never moves the action control: the key field gives way and cuts its text instead */
  .bind > :global(.cg-label) { flex: 1 0 auto; }
  .bind > :global(.recorder) { min-width: 0; overflow: hidden; }
  .bind > :global(.seg) { flex: none; margin-left: auto; }
</style>
