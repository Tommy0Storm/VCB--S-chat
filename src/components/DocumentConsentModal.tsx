import React from 'react';
import type { StoredDocument } from '../types/documents';

interface DocumentConsentModalProps {
  onConsent: () => void;
  onDecline: () => void;
  isOpen: boolean;
  document: StoredDocument | null;
}

/**
 * POPIA-compliant document consent modal
 * 
 * This modal requires explicit user consent before any document data is processed
 * in accordance with POPIA Section 72 (cross-border data transfer restrictions)
 */
export const DocumentConsentModal: React.FC<DocumentConsentModalProps> = ({
  onConsent,
  onDecline,
  isOpen
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-vcb-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={onDecline}>
      <div className="bg-white border-2 border-vcb-accent max-w-2xl w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="bg-vcb-black px-6 py-4 flex items-center justify-between border-b-2 border-vcb-accent">
          <div className="flex items-center space-x-3">
            <span className="material-icons text-vcb-accent text-2xl">lock</span>
            <h2 className="text-white font-bold text-lg uppercase tracking-wide">POPIA Consent Required</h2>
          </div>
          <button
            onClick={onDecline}
            className="text-white hover:text-vcb-accent transition-colors"
            title="Close"
          >
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          <div className="flex items-start space-x-3 mb-6">
            <span className="material-icons text-vcb-accent text-3xl mt-1">info</span>
            <div>
              <p className="text-vcb-black font-medium mb-3">
                To ground your answer in your private documents, we must send the relevant facts, and only those facts, to our LLM located in the US.
              </p>
              <p className="text-vcb-black font-medium mb-3">
                The LLM provider is contractually restricted from using this data for training.
              </p>
              <p className="text-vcb-black font-medium mb-3">
                Your documents will be processed locally on your device using ONNX.js with the MiniLM-L6-v2 model to generate embeddings.
              </p>
              <p className="text-vcb-black font-medium mb-3">
                Only the minimal relevant text fragments (not full documents) will be transmitted to the US-based LLM after you provide consent.
              </p>
              <p className="text-vcb-black font-medium mb-3">
                Your consent is required under POPIA Section 72 for cross-border data transfer.
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-2">
              <span className="material-icons text-yellow-600 text-lg mt-0.5">warning</span>
              <div>
                <p className="text-yellow-800 font-medium text-sm">
                  Your document content will NEVER be transmitted to the US-based LLM without your explicit consent.
                </p>
                <p className="text-yellow-700 text-sm mt-1">
                  The system will only send the minimal text fragments needed to answer your question.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onConsent}
              className="flex-1 bg-vcb-accent hover:bg-yellow-500 text-vcb-black px-6 py-3 font-bold uppercase tracking-wide text-sm transition-colors rounded flex items-center justify-center space-x-2"
            >
              <span className="material-icons">check</span>
              <span>Consent to Data Transfer</span>
            </button>
            <button
              onClick={onDecline}
              className="flex-1 bg-white border-2 border-vcb-mid-grey hover:border-vcb-black text-vcb-black font-bold uppercase tracking-wide text-sm transition-colors rounded flex items-center justify-center space-x-2"
            >
              <span className="material-icons">close</span>
              <span>Decline</span>
            </button>
          </div>

          <div className="mt-6 text-xs text-vcb-mid-grey">
            <p className="mb-2">
              <strong>POPIA Compliance:</strong> This consent mechanism complies with the Protection of Personal Information Act (POPIA) Section 72, 
              which requires explicit consent for cross-border data transfers.
            </p>
            <p>
              Your consent is recorded locally on your device and will be required for each new document upload.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};