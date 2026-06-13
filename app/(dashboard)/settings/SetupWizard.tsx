'use client';

import React, { useState, useCallback } from 'react';

/**
 * SetupWizard
 *
 * Guided configuration component for AgentLens.
 * Walks users through:
 * 1. Tenant ID (Entra tenant)
 * 2. Client ID (app registration)
 * 3. Custom thresholds (budget, escalation)
 *
 * On the final step the wizard:
 *   - Calls POST /api/config/verify to confirm the credentials can obtain a
 *     token server-side (no secret is sent from the browser).
 *   - If verification passes, calls POST /api/config/save which validates the
 *     non-secret identifiers and returns a ready-to-copy .env block.
 *   - Renders the returned .env block as a code block with a Copy button,
 *     instructing the operator to paste values into .env.local (dev) or
 *     Azure Key Vault / App Service settings (production).
 *
 * NEVER persists config or secrets to localStorage or any client-side store.
 * Secrets belong in Azure Key Vault (prod) or .env.local (dev only, not
 * committed to source control).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetupStep {
  key: string;
  label: string;
  description: string;
  fields: SetupField[];
  optional?: boolean;
}

interface SetupField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'url';
  placeholder?: string;
  required?: boolean;
  help?: string;
  pattern?: string;
}

interface SetupState {
  tenantId: string;
  clientId: string;
  budgetThreshold: number;
  escalationThreshold: number;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const SETUP_STEPS: SetupStep[] = [
  {
    key: 'tenant',
    label: 'Entra Tenant',
    description: 'Your Microsoft Entra tenant ID (found in Azure Portal)',
    fields: [
      {
        name: 'tenantId',
        label: 'Tenant ID',
        type: 'text',
        placeholder: '12345678-1234-1234-1234-123456789012',
        required: true,
        help: 'Get this from Azure Portal > Entra ID > Overview',
        pattern: '^[a-f0-9-]{36}$|^[a-zA-Z0-9-.]+\\.onmicrosoft\\.com$',
      },
    ],
  },
  {
    key: 'appReg',
    label: 'App Registration',
    description: 'Client ID of your AgentLens app registration',
    fields: [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        placeholder: '87654321-4321-4321-4321-210987654321',
        required: true,
        help: 'Get this from Azure Portal > Entra ID > App registrations > Your app',
        pattern: '^[a-f0-9-]{36}$',
      },
    ],
  },
  {
    key: 'thresholds',
    label: 'Governance Thresholds',
    description: 'Set alert triggers for cost and usage',
    fields: [
      {
        name: 'budgetThreshold',
        label: 'Monthly Budget Threshold (USD)',
        type: 'number',
        placeholder: '5000',
        required: true,
        help: 'Alert if monthly costs exceed this amount',
      },
      {
        name: 'escalationThreshold',
        label: 'Escalation Rate Threshold (%)',
        type: 'number',
        placeholder: '25',
        required: true,
        help: 'Alert if agent escalation rate exceeds this percentage',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CopyButton helper
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded px-2 py-1 text-xs bg-slate-700 text-slate-300
                 hover:bg-slate-600 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SetupWizard() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [state, setState] = useState<SetupState>({
    tenantId: '',
    clientId: '',
    budgetThreshold: 5000,
    escalationThreshold: 25,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Result state after the final submit
  const [envBlock, setEnvBlock] = useState<string | null>(null);

  const currentStep = SETUP_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === SETUP_STEPS.length - 1;

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validateField = useCallback((field: SetupField, value: string): string => {
    if (field.required && !value.trim()) {
      return `${field.label} is required`;
    }
    if (field.pattern && value && !new RegExp(field.pattern).test(value)) {
      return `${field.label} format is invalid`;
    }
    if (field.type === 'email' && value && !value.includes('@')) {
      return 'Please enter a valid email address';
    }
    if (field.type === 'url' && value && !value.startsWith('http')) {
      return 'Please enter a valid URL';
    }
    if (field.type === 'number' && value && isNaN(parseFloat(value))) {
      return `${field.label} must be a number`;
    }
    return '';
  }, []);

  const validateCurrentStep = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    for (const field of currentStep.fields) {
      const value = String(state[field.name as keyof SetupState] ?? '');
      const error = validateField(field, value);
      if (error) errors[field.name] = error;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [currentStep, state, validateField]);

  // ---------------------------------------------------------------------------
  // Field change
  // ---------------------------------------------------------------------------

  const handleFieldChange = useCallback((fieldName: string, value: string) => {
    setState((prev) => ({
      ...prev,
      [fieldName]: fieldName.includes('Threshold') ? parseFloat(value) || 0 : value,
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      delete next['_submit'];
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const handlePrev = useCallback(() => {
    if (currentStepIndex > 0) setCurrentStepIndex((i) => i - 1);
  }, [currentStepIndex]);

  const handleNext = useCallback(() => {
    if (validateCurrentStep() && currentStepIndex < SETUP_STEPS.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    }
  }, [currentStepIndex, validateCurrentStep]);

  // ---------------------------------------------------------------------------
  // Final submit: verify then save
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!validateCurrentStep()) return;
    setIsSubmitting(true);
    setFieldErrors({});

    try {
      // Step 1: verify credentials server-side
      const verifyRes = await fetch('/api/config/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: state.tenantId,
          clientId: state.clientId,
        }),
      });

      if (!verifyRes.ok) {
        setFieldErrors({ _submit: `Verification request failed (HTTP ${verifyRes.status})` });
        return;
      }

      const verifyData = (await verifyRes.json()) as { ok: boolean; error?: string };
      if (!verifyData.ok) {
        setFieldErrors({ _submit: verifyData.error ?? 'Verification failed. Check credentials.' });
        return;
      }

      // Step 2: get the .env block for copy-paste
      const saveRes = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: state.tenantId,
          clientId: state.clientId,
          budgetThreshold: state.budgetThreshold,
          escalationThreshold: state.escalationThreshold,
        }),
      });

      if (!saveRes.ok) {
        setFieldErrors({ _submit: `Save request failed (HTTP ${saveRes.status})` });
        return;
      }

      const saveData = (await saveRes.json()) as { ok: boolean; envBlock?: string; error?: string };
      if (!saveData.ok) {
        setFieldErrors({ _submit: saveData.error ?? 'Could not generate config block.' });
        return;
      }

      setEnvBlock(saveData.envBlock ?? '');
    } catch (err) {
      setFieldErrors({ _submit: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSubmitting(false);
    }
  }, [state, validateCurrentStep]);

  // ---------------------------------------------------------------------------
  // Render - envBlock result screen
  // ---------------------------------------------------------------------------

  if (envBlock !== null) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Configuration ready</h1>
          <p className="mt-2 text-slate-400">
            Verification passed. Copy the block below into your configuration store.
          </p>
        </div>

        <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-300">Credentials verified successfully</p>
          <p className="mt-1 text-xs text-slate-400">
            The server confirmed it can acquire an ARM token with the configured service principal.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">
              .env.local (dev) / App Service env vars (prod)
            </p>
            <CopyButton text={envBlock} />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-4 text-xs text-emerald-300 leading-relaxed whitespace-pre">
            {envBlock}
          </pre>
        </div>

        <div className="rounded-md border border-amber-800/40 bg-amber-900/10 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-amber-300">Security notice</p>
          <p className="text-xs text-slate-400">
            This block contains only non-secret identifiers. Secrets
            (AZURE_CLIENT_SECRET, API keys, webhook URLs) were NOT persisted by
            this wizard - set them directly in Azure Key Vault (production) or
            .env.local (local dev, never commit to source control).
          </p>
        </div>

        <button
          onClick={() => {
            setEnvBlock(null);
            setCurrentStepIndex(0);
            setState({ tenantId: '', clientId: '', budgetThreshold: 5000, escalationThreshold: 25 });
          }}
          className="rounded-md px-4 py-2 text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Start over
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render - wizard steps
  // ---------------------------------------------------------------------------

  const allFieldsValid = !Object.keys(fieldErrors).some((k) => k !== '_submit');

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Setup Wizard</h1>
        <p className="mt-2 text-slate-400">
          Configure AgentLens to connect to your Entra tenant and Power Platform estate.
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">
            Step {currentStepIndex + 1} of {SETUP_STEPS.length}
          </span>
          <span className="text-slate-400">{currentStep.label}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / SETUP_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="space-y-6 rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div>
          <h2 className="text-xl font-semibold text-white">{currentStep.label}</h2>
          <p className="mt-1 text-slate-400">{currentStep.description}</p>
        </div>

        <div className="space-y-4">
          {currentStep.fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-slate-300">
                {field.label}
                {field.required && <span className="ml-0.5 text-red-400">*</span>}
              </label>
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={String(state[field.name as keyof SetupState] ?? '')}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                className={[
                  'mt-1 w-full rounded-md bg-slate-800 px-3 py-2 text-white',
                  'border transition-colors placeholder-slate-500 focus:outline-none focus:ring-1',
                  fieldErrors[field.name]
                    ? 'border-red-500 focus:border-red-400 focus:ring-red-500'
                    : 'border-slate-700 focus:border-emerald-500 focus:ring-emerald-500',
                ].join(' ')}
              />
              {fieldErrors[field.name] ? (
                <p className="mt-1 text-sm text-red-400">{fieldErrors[field.name]}</p>
              ) : field.help ? (
                <p className="mt-1 text-xs text-slate-500">{field.help}</p>
              ) : null}
            </div>
          ))}
        </div>

        {/* Submission error */}
        {fieldErrors._submit && (
          <div className="rounded-md border border-red-900 bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-300">{fieldErrors._submit}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          disabled={currentStepIndex === 0}
          className={[
            'rounded-md px-4 py-2 font-medium transition-colors',
            currentStepIndex === 0
              ? 'cursor-not-allowed bg-slate-800 text-slate-600'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
          ].join(' ')}
        >
          Previous
        </button>

        <div className="text-sm text-slate-500">
          {currentStep.optional && <span className="italic">(Optional step)</span>}
        </div>

        {isLastStep ? (
          <button
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !allFieldsValid}
            className={[
              'rounded-md px-4 py-2 font-medium transition-colors',
              isSubmitting || !allFieldsValid
                ? 'cursor-not-allowed bg-emerald-900/50 text-emerald-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700',
            ].join(' ')}
          >
            {isSubmitting ? 'Verifying...' : 'Verify & generate config'}
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!allFieldsValid}
            className={[
              'rounded-md px-4 py-2 font-medium transition-colors',
              !allFieldsValid
                ? 'cursor-not-allowed bg-emerald-900/50 text-emerald-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700',
            ].join(' ')}
          >
            Next
          </button>
        )}
      </div>

      {/* Help box */}
      <div className="rounded-md border border-slate-800 bg-slate-900/50 px-4 py-3">
        <h3 className="text-sm font-medium text-slate-300">Need help?</h3>
        <ul className="mt-2 space-y-1 text-xs text-slate-400">
          <li>
            - Find your tenant ID in{' '}
            <a
              href="https://portal.azure.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              Azure Portal
            </a>
            {' > '}Entra ID
          </li>
          <li>
            - Create an app registration in{' '}
            <a
              href="https://portal.azure.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              Azure Portal
            </a>
            {' > '}Entra ID{' > '}App registrations
          </li>
          <li>
            - See{' '}
            <a
              href="/docs/INSTALL.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              Installation Guide
            </a>
            {' '}for detailed steps
          </li>
        </ul>
      </div>
    </div>
  );
}
