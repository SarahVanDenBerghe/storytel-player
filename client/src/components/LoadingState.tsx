import React from 'react';

interface LoadingStateProps {
  message: string;
}

function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div role="status" className="text-center flex flex-col items-center">
        <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#FF5100] mb-4"></div>
        <div className="text-[15px] font-medium text-[#E5E7EB]">{message}</div>
      </div>
    </div>
  );
}

export default LoadingState;