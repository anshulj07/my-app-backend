"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

export default function VerificationsPage() {
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verifications");
      const json = await res.json();
      if (json.ok) {
        setPending(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleAction = async (clerkUserId: string, action: "approve" | "reject") => {
    if (!confirm(`Are you sure you want to ${action} this verification?`)) return;

    try {
      const res = await fetch("/api/admin/verifications/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ clerkUserId, action })
      });
      const json = await res.json();
      if (json.ok) {
        alert(`Successfully ${action}d!`);
        fetchPending(); // refresh list
      } else {
        alert(`Error: ${json.error}`);
      }
    } catch (e) {
      alert("Network error");
      console.error(e);
    }
  };

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 20 }}>Pending Verifications</h1>
      
      {loading ? (
        <p>Loading...</p>
      ) : pending.length === 0 ? (
        <p>No pending verifications found.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {pending.map((user) => (
            <div key={user._id} style={{ border: "1px solid #ccc", padding: 20, borderRadius: 10, width: 300 }}>
              <h3 style={{ margin: "0 0 10px 0" }}>{user.name}</h3>
              <p style={{ margin: "0 0 15px 0", color: "#666" }}>{user.email}</p>
              
              {user.verificationImage ? (
                <div style={{ marginBottom: 15 }}>
                  <img 
                    src={user.verificationImage} 
                    alt="Selfie" 
                    style={{ width: "100%", height: "auto", borderRadius: 8, objectFit: "cover" }}
                  />
                </div>
              ) : (
                <div style={{ height: 200, backgroundColor: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 15 }}>
                  <p>No Image</p>
                </div>
              )}
              
              <div style={{ display: "flex", gap: 10 }}>
                <button 
                  onClick={() => handleAction(user.clerkUserId, "approve")}
                  style={{ flex: 1, padding: "10px", backgroundColor: "#22c55e", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: "bold" }}
                >
                  Approve
                </button>
                <button 
                  onClick={() => handleAction(user.clerkUserId, "reject")}
                  style={{ flex: 1, padding: "10px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: "bold" }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
