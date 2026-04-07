import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";

const NODE_URL = import.meta.env.VITE_NODE_URL || "http://localhost:3000";

export default function LeanControl() {
  const [leanDeg, setLeanDeg] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    // Initial fetch of current lean deg
    fetch(`${NODE_URL}/control/lean`)
      .then(res => res.json())
      .then(data => {
        if (typeof data.lean_deg === "number") setLeanDeg(data.lean_deg);
      })
      .catch(err => console.error("Failed to fetch lean position", err));
  }, []);

  const handleChange = async (e) => {
    const newVal = Number(e.target.value);
    setLeanDeg(newVal);
    setIsUpdating(true);
    try {
      await fetch(`${NODE_URL}/control/lean`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ lean_deg: newVal })
      });
    } catch (err) {
      console.error("Failed to update lean position", err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow p-4 mb-4 border-t-4 border-green-500">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">📐</span>
          <div className="font-semibold text-gray-800">Lean Position Control</div>
        </div>
        <div className={`text-sm font-medium ${isUpdating ? "text-blue-500 animate-pulse" : "text-gray-600"}`}>
          {leanDeg}°
        </div>
      </div>
      <input
        type="range"
        min="-45"
        max="45"
        step="1"
        value={leanDeg}
        onChange={handleChange}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
      />
      <div className="flex justify-between mt-1 text-[10px] text-gray-400 font-medium px-1">
        <span>-45°</span>
        <span>0°</span>
        <span>+45°</span>
      </div>
      <p className="mt-2 text-xs text-gray-500 leading-relaxed">
        Adjust the antenna lean angle manually. This value is used for real-time signal calculations and model inputs.
      </p>
    </div>
  );
}
