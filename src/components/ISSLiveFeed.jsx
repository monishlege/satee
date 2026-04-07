import React from "react";

const ISSLiveFeed = () => {
  return (
    <div className="w-full bg-white rounded-lg shadow p-4 mb-4 border-t-4 border-blue-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚀</span>
          <div className="font-semibold text-gray-800">ISS Mission Control</div>
        </div>
        <a 
          href="https://isslivenow.com/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm"
        >
          View Live Feed
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
      <p className="mt-2 text-xs text-gray-500 leading-relaxed">
        Access the high-definition live video stream and detailed orbital tracking directly from the official ISS Live Now dashboard.
      </p>
    </div>
  );
};

export default ISSLiveFeed;
