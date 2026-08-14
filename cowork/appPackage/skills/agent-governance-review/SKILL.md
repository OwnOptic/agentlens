---
name: agent-governance-review
description: |
  Runs a governance review of the tenant's AI agent estate using the AgentLens
  connector tools. Use when the user asks to "review our agents", "audit agent
  sprawl", "check DLP coverage", "which agents should we retire", "find
  duplicate agents", "what do our agents cost", or "map our agent estate".
license: Proprietary
metadata:
  author: Elliot Margot
  version: "1.0"
---

# Agent governance review

## What this skill does

Guides a structured, read-only review of every AI agent in the tenant using
the AgentLens connector, and turns the findings into a decision-ready summary.

## The one rule

AgentLens never fabricates a number, and neither does this review. Every tool
marks each source as connected, partial or not_connected. **Zero and unknown
are different answers**: a store that could not be read is reported as
unreadable with its fix, never counted as zero agents. Never present a partial
sweep as a complete one.

## Workflow

1. Use the `sweep_inventory` tool to read every agent store. Note which stores
   were read and which report not_connected, and relay each remediation
   verbatim.
2. Use the `dlp_posture` tool. Any environment with no covering policy is a
   finding; the default environment uncovered is critical.
3. Use the `value_and_cost` tool. Report the billed figure and the derived
   consumption figure separately - they are never added together. State the
   rate and its source for any per-agent cost.
4. Use the `consolidation_plan` tool when the sweep found duplicate clusters.
   The plan names the agent to keep in each cluster; the administrator
   executes it - AgentLens changes nothing.
5. Use the `agent_map` tool for a picture of the estate. Offer its `svg` field
   as a file; describe the picture in words as well.

## Output format

Lead with the verdict and its `as of` timestamp, then:

| Area | Finding | Confidence |
|---|---|---|
| Inventory | agents found, per store, unread stores named | which sources were read |
| DLP | uncovered environments, loudest first | |
| Value | promote / improve / consolidate / retire counts | unmeasured stated, never guessed |
| Next action | the single most important one, named specifically | |

Close every review by stating which sources were NOT read and how the answer
could change if they contained agents.
