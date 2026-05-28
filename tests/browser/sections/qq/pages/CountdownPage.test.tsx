import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountdownPage } from "@/sections/qq/pages/CountdownPage";

describe("CountdownPage", () => {
  it("renders field containers without native labels around complex controls", () => {
    const markup = renderToStaticMarkup(
      <CountdownPage
        tasks={[]}
        groups={[]}
        groupsLoading={false}
        groupsError=""
        onCreateTask={() => undefined}
        onRemoveTask={() => undefined}
      />
    );

    expect(markup).not.toContain('<label class="field"');
    expect(markup).toContain('<div class="field"');
  });
});
