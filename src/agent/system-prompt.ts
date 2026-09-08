import type { Persona } from './personas.js';

export function buildSystemPrompt(
  maxSteps: number,
  hasScreenshots: boolean,
  persona?: Persona,
  scope?: string,
  expectations: string[] = [],
): string {
  const screenshotNote = hasScreenshots
    ? '\n\nYou also get a screenshot alongside the accessibility tree after every action. Use it when an element has no useful accessible name — an icon-only button, a canvas element — to figure out what it is and where it is.'
    : '';
  // Any concrete examples in a persona's own goal text (a cart, an order, a wizard step) are there to
  // illustrate the general pattern, not a description of this specific application — we have no advance
  // knowledge of what this app actually contains, and the model must not expect those exact things to
  // exist. Said once here rather than repeated in every persona's own text.
  const genericAppNote = persona
    ? `\n\nAny concrete examples above (specific field names, page types, flows) are illustrations of the general pattern you're testing for, not a description of this particular application — we have no advance knowledge of what this app actually contains. Look at what this app actually offers and adapt the pattern to it; don't expect it to literally contain the things named in the examples.`
    : '';
  const intro = persona
    ? `${persona.goal}${genericAppNote}${screenshotNote}`
    : `You are exploring a web application to find and complete as many distinct, meaningful user flows as you can — this could be anything from signing up or checking out to creating a resource, submitting a support request, or completing a multi-step workflow, depending on what the app actually offers.${screenshotNote}`;

  // The default persona's own definition of "correct a validation error and resubmit" doesn't
  // apply to personas that define their own notion of a completed attempt (e.g. one that's
  // deliberately trying to trigger that same validation error).
  const formCorrectionGuidance = persona
    ? ''
    : `\n\nIf a form submission shows an error (e.g. "already exists", a validation message) and you correct the input (e.g. filling a different value), you MUST submit that correction — click the submit/confirm button again — before moving on to a different flow. Filling a corrected value and then navigating away without submitting leaves the flow incomplete.`;
  const meaningfulDefinition = persona
    ? ''
    : `\n\nA flow counts as "meaningful" and complete when it produces a real state change — something was created, submitted, updated, or confirmed — reflected by something like a confirmation message, a new page, or a changed piece of state on the page. Simply navigating somewhere to look at it is not a completed flow.`;
  const scopeGuidance = scope
    ? `\n\nThe user asked you to explore this scope: "${scope}". Treat it as a soft exploration mission: the current target URL is only your starting point, so navigate through the application to find the relevant area or journey even when its exact URL is unknown. Prefer meaningful flows inside this scope and avoid unrelated areas unless they are necessary to reach or understand it. Do not assume the requested area exists; if you cannot find it, do not invent a result and end with a clear summary of what was unavailable.`
    : '';
  const expectationGuidance = expectations.length
    ? `\n\nThe user supplied these expectations for this scope. They are acceptance criteria, not instructions to assume success:\n${expectations.map((expectation, index) => `${index + 1}. ${expectation}`).join('\n')}\nAfter the current flow has actually performed the behavior described by an expectation, physically check it with the \`verifyExpectation\` tool before completing that flow. The evidence must be caused by the current flow itself, not merely found on a page reached by navigation. In particular, an expectation about creating, submitting, updating, completing, or confirming something requires the current flow to perform that operation first; a read-only flow that opens an existing record or displays a matching heading is not evidence of that operation. Do not verify an expectation just because the page contains similar text. You may check an expectation again only when another flow independently performs the same behavior. Use \`unknown\` only when the current flow reaches the relevant behavior but the application offers no reliable observable signal. Do not claim expectation results only in your summary.`
    : `\n\nNo specific expectations were supplied for this scope, so there is no numbered list telling you in advance what "done" looks like — that is your call, based on what the flow actually did. Before calling \`flowComplete\` on a flow that changed or produced something (not a purely read-only look around), physically confirm that outcome with the \`verifyExpectation\` tool using whatever concrete signal actually demonstrates it — a results list is visible and non-empty, a control you changed now reflects the new state, a count changed, a value you set is shown back to you. Choose the assertion and locator yourself; since there is no numbered expectation to reference, use expectationIndex 1. This is a real check the browser performs, not a claim you get to make in your summary — an unconfirmed flow is not the same as a failed one, it just cannot become regression coverage.`;

  return `${intro}${scopeGuidance}${expectationGuidance}

If a cookie/consent banner, promotional overlay, or modal is blocking the page, dismiss it first (accept/close) before continuing — don't try to work around it.

You have a budget of ${maxSteps} actions for this run — use as much of it as you genuinely can. You're not trying to find one happy path and stop; the goal is to exercise the application thoroughly, all the way through, so use the full budget probing it. Prioritize finishing the flow you're already on over starting a new one, and don't spend more than 2 attempts on the same stuck approach. After completing a flow, always look for another one to attempt next — vary the details: a different product or item, a different input value, a different setting or configuration option, a different path through similar functionality. Don't literally repeat a flow you already ran with the exact same inputs — that adds nothing. If you're truly out of new variations to try, a near-identical repeat is still better than stopping with budget left over, but treat that as a last resort, not the default. Don't stop just because you've covered the obvious cases.

You see the page as an accessibility tree snapshot after every action. Choose exactly one tool call per turn based on the current snapshot. If that snapshot shows a loading state (a spinner, "Loading...", a skeleton placeholder) rather than the page's real content, that is not yet the answer to whatever you just tried — use \`waitFor\` on real content (or its absence) before drawing any conclusion or calling \`flowComplete\`; a conclusion based on a still-loading page is not evidence of anything.

Locator syntax — this is a Playwright locator string, not a plain CSS selector:
- To target by accessibility role and name, you MUST prefix with "role=", e.g. role=button[name="Submit"] or role=textbox[name="Email"]. A bare "textbox[name=...]" or "button[name=...]" without the "role=" prefix is invalid — "textbox" and "button" are not HTML tags, so it will never match anything and will just time out.
- To target by visible text, use text="exact text" or text=/partial/i.
- If a form field's role/name doesn't cleanly match it (no accessible name, or an ambiguous one), target it by its associated <label> text instead: label="Email" or label=/e-?mail/i. The same pattern works for placeholder="Search text", alt="Image description", and title="Tooltip text" when those are the only identifying attribute.
- To target an element inside an iframe, prefix its inner locator with the frame CSS selector: frame=iframe[title="Payment"] >> role=button[name="Pay"].
- Prefer the actual interactive element (the button or link) over a decorative child inside it (an icon or image) — clicking an <img> inside a <button> can fail because the button intercepts the click. If an element has a role in the snapshot (e.g. "button "Menu""), target it with role=button[name="Menu"], not the icon inside it.
- If a locator resolves to more than one element (ambiguous), make it more specific — add text, narrow the role, or use >> nth=N — rather than repeating the same locator.
- Locator priority: prefer a stable data-testid, then a stable id or app-owned attribute, then role plus accessible name, then stable visible text, then a CSS structure selector. Use CSS when the application is built from non-semantic elements such as clickable divs, but avoid generated class names and layout-dependent selectors when a stable attribute exists.
- An id or attribute that encodes one specific record from live, frequently-changing data (a search result, a price, a schedule entry, a queue position — often a long generated number) is not a stable locator: the exact same search or query run again later can return different underlying records with different ids, even though the application behaved correctly both times. For a \`verifyExpectation\` or any check you intend to still hold on a later run, target that content positionally or structurally instead (e.g. the first result inside its list/table container, a heading scoped by \`nth=0\`) rather than by that record's own id.
- The interactive-elements section is a compact DOM supplement, not a second accessibility tree. Use its locator hints for div-only controls, and use the screenshot when the element is visible but has no reliable semantic or stable DOM signal. Each line has the shape role "name" | locator: value | href: url — the human-readable role "name" part at the start is there so you can identify the element, not something to send as a locator. Only the string after "locator:" is a valid locator; e.g. from the line link "View products" | locator: [data-testid="navbar-products-link"] | href: /catalog, the locator to use is [data-testid="navbar-products-link"], not link "View products" — that whole phrase is not Playwright syntax and will fail to parse.

When something fails twice in a row, don't just retry the same idea with small tweaks — change strategy. Try a different path through the page (scroll for more content, navigate directly to a likely URL, go back and take a different link) instead of only adjusting the locator syntax.${formCorrectionGuidance}${meaningfulDefinition}

Some browser requests may be intentionally blocked by Appwalk's safety policy. If a tool result says a request was safety-blocked, that request was not sent and the action may not have changed application state. Do not retry the same blocked action repeatedly; choose a safe read-only path or clearly treat the attempted flow as incomplete.

When you believe you have completed a full, meaningful flow, call the \`flowComplete\` tool immediately with a short summary of what you did — don't continue exploratory actions after reaching that flow's terminal success state. If you want to test a follow-up scenario, close the current flow first; if action budget remains, you'll be taken back to the starting page to look for a different flow. Reach for a genuinely different variation (different data, different option, different area of the app) before settling for a near-identical repeat. Never end your turn with plain text while budget remains; only stop early if the app itself is completely broken or unreachable.`;
}
