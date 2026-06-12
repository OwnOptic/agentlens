# AgentLens v2

**Single-tenant Copilot agent governance and observability platform — powered by Azure Resource Graph.**

AgentLens surfaces all Copilot Studio agents across your entire Power Platform estate in one unified dashboard. Track credit cost, capacity, compliance, maturity, and health — with intelligent alerting, release gates, and policy-as-code controls.

## What is AgentLens?

- **Complete agent inventory** - Every Copilot Studio agent across all environments, via Azure Resource Graph
- **Credit and capacity analytics** - Per-feature cost breakdown, capacity tracking, overage detection
- **Proactive alerting** - Budget breaches, volume spikes, compliance violations, risky patterns
- **Compliance engine** - Configurable rules, violation tracking, risk-pattern detection
- **Maturity assessment** - 0-4 scoring across security, management, and reporting pillars
- **Release gates with policy-as-code** - YAML-based policies, signed decisions, audit trail
- **Conversation KPIs and health** - Deflection rates, latency, error tracking via App Insights
- **Single-tenant** - One app instance per Entra tenant; installs in <5 minutes

## Quick Start

See [docs/INSTALL.md](docs/INSTALL.md) for the full 4-step installation guide.

**TL;DR:**
1. Deploy the web app (`npm install && npm run build && npm start`)
2. Create an Entra app registration with ARG read permission
3. Run the optional provision script (sets up legacy deep-scan if needed)
4. Set environment variables and launch

For architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## How It Works

**Backbone:** Azure Resource Graph (`PowerPlatformResources` queries) provides whole-tenant agent inventory in a single call — no per-environment polling, no Dataverse import.

**Cost & Capacity:** PPAC Licensing API for per-agent credit metrics, with CSV fallback and feature breakdown (generative answers, agent actions, flows, text tools).

**Governance Stack:** Configurable compliance rules, risky-pattern detection, maturity scoring (0-4 across 3 pillars), and policy-as-code release gates with signed audit records.

**Alerts & KPIs:** Proactive Teams/email notifications for budget, spikes, overage, compliance. Conversation KPI aggregates and App Insights health metrics (no message content).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

## Configuration

All configuration happens in the **Settings > Setup Wizard** page. The wizard guides you through:
1. Tenant ID (Entra tenant)
2. Client ID (app registration)
3. Teams webhook URL (for alerts, optional)
4. Custom thresholds (budget, escalation)

**Environment variables** are minimally required; most settings are managed in-app. See [docs/INSTALL.md](docs/INSTALL.md#step-4-environment-variables) for the full list.

## Support

For issues or questions:
- Check the [GitHub Issues](https://github.com/your-org/agentlens/issues)
- Review the [Install Guide](docs/INSTALL.md) for troubleshooting
- Contact your Copilot/AI leadership
