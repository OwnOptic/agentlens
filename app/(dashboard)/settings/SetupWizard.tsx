'use client';

import React, { useState, useCallback } from 'react';

/**
 * SetupWizard
 *
 * Guided configuration component for AgentLens.
 * Walks users through:
 * 1. Tenant ID (Entra tenant)
 * 2. Client ID (app registration)
 * 3. Teams webhook URL (for alerts, optional)
 * 4. Custom thresholds (budget, escalation)
 *
 * Stores settings in Supabase or browser localStorage if not configured.
 * Validates each step before allowing progression.
 */

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
  teamsWebhookUrl: string;
  budgetThreshold: number;
  escalationThreshold: number;
}

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
    key: 'alerts',
    label: 'Alert Notifications',
    description: 'Optional: Configure where alerts are sent',
    fields: [
      {
        name: 'teamsWebhookUrl',
        label: 'Teams Webhook URL',
        type: 'url',
        placeholder: 'https://outlook.webhook.office.com/webhookb2/...',
        required: false,
        help: 'Create a webhook connector in Teams to receive alerts (optional)',
      },
    ],
    optional: true,
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

export default function SetupWizard() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [state, setState] = useState<SetupState>({
    tenantId: '',
    clientId: '',
    teamsWebhookUrl: '',
    budgetThreshold: 5000,
    escalationThreshold: 25,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  const currentStep = SETUP_STEPS[currentStepIndex];

  // Validate a single field
  const validateField = useCallback((field: SetupField, value: string): string => {
    if (field.required && !value) {
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

  // Handle field value change
  const handleFieldChange = useCallback(
    (fieldName: string, value: string) => {
      setState((prev) => ({
        ...prev,
        [fieldName]: fieldName.includes('Threshold') ? parseFloat(value) || 0 : value,
      }));

      // Clear error for this field
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    },
    []
  );

  // Validate current step
  const validateCurrentStep = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    for (const field of currentStep.fields) {
      const value = state[field.name as keyof SetupState]?.toString() || '';
      const error = validateField(field, value);
      if (error) {
        errors[field.name] = error;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [currentStep, state, validateField]);

  // Handle next button
  const handleNext = useCallback(() => {
    if (!validateCurrentStep()) {
      return;
    }

    if (currentStepIndex < SETUP_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  }, [currentStepIndex, validateCurrentStep]);

  // Handle previous button
  const handlePrev = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }, [currentStepIndex]);

  // Handle verify connection
  const handleVerify = useCallback(async () => {
    if (!validateCurrentStep()) {
      return;
    }

    setIsVerifying(true);

    try {
      // Call API to verify the connection
      const response = await fetch('/api/config/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: state.tenantId,
          clientId: state.clientId,
        }),
      });

      if (response.ok) {
        setVerified(true);

        // Save settings to storage
        if (typeof window !== 'undefined') {
          localStorage.setItem('agentlens-config', JSON.stringify(state));
        }
      } else {
        const error = await response.json();
        setFieldErrors({
          _submit: error.error || 'Verification failed. Check your credentials.',
        });
      }
    } catch (error) {
      setFieldErrors({
        _submit: `Error: ${(error as Error).message}`,
      });
    } finally {
      setIsVerifying(false);
    }
  }, [state, validateCurrentStep]);

  const isLastStep = currentStepIndex === SETUP_STEPS.length - 1;
  const allFieldsValid = !Object.keys(fieldErrors).some((k) => k !== '_submit');

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Setup Wizard</h1>
        <p className="mt-2 text-slate-400">
          Configure AgentLens to connect to your Entra tenant and Power Platform estate
        </p>
      </div>

      {/* Progress indicator */}
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
            style={{
              width: `${((currentStepIndex + 1) / SETUP_STEPS.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="space-y-6 rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div>
          <h2 className="text-xl font-semibold text-white">{currentStep.label}</h2>
          <p className="mt-1 text-slate-400">{currentStep.description}</p>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          {currentStep.fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-slate-300">
                {field.label}
                {field.required && <span className="text-red-400">*</span>}
              </label>
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={state[field.name as keyof SetupState] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                className={[
                  'mt-1 w-full rounded-md bg-slate-800 px-3 py-2 text-white',
                  'border transition-colors placeholder-slate-500',
                  fieldErrors[field.name]
                    ? 'border-red-500 focus:border-red-400'
                    : 'border-slate-700 focus:border-emerald-500',
                  'focus:outline-none focus:ring-1',
                  fieldErrors[field.name]
                    ? 'focus:ring-red-500'
                    : 'focus:ring-emerald-500',
                ].join(' ')}
              />
              {fieldErrors[field.name] && (
                <p className="mt-1 text-sm text-red-400">{fieldErrors[field.name]}</p>
              )}
              {field.help && !fieldErrors[field.name] && (
                <p className="mt-1 text-xs text-slate-500">{field.help}</p>
              )}
            </div>
          ))}
        </div>

        {/* Submission error */}
        {fieldErrors._submit && (
          <div className="rounded-md border border-red-900 bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-300">{fieldErrors._submit}</p>
          </div>
        )}

        {/* Success message */}
        {verified && (
          <div className="rounded-md border border-emerald-900 bg-emerald-900/20 px-4 py-3">
            <p className="text-sm text-emerald-300">✓ Configuration verified and saved!</p>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
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
            onClick={handleVerify}
            disabled={isVerifying || !allFieldsValid}
            className={[
              'rounded-md px-4 py-2 font-medium transition-colors',
              isVerifying || !allFieldsValid
                ? 'cursor-not-allowed bg-emerald-900/50 text-emerald-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700',
            ].join(' ')}
          >
            {isVerifying ? 'Verifying...' : 'Verify & Save'}
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

      {/* Info box */}
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
            {' > '}Entra ID {' > '}App registrations
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
