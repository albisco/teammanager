"use client";

import { useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ClubLogo } from "@/components/club-logo";
import { validateLogoFile } from "@/lib/logo-validation";
import { toast } from "sonner";

interface LogoDropzoneProps {
  clubId: string;
  clubName: string;
  logoUrl: string | null;
  onLogoChange: (url: string | null) => void;
}

export function LogoDropzone({ clubId, clubName, logoUrl, onLogoChange }: LogoDropzoneProps) {
  const { update } = useSession();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const error = validateLogoFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/clubs/${clubId}/logo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Upload failed");
        return;
      }
      const data = await res.json();
      onLogoChange(data.logoUrl);
      await update();
      toast.success("Logo uploaded");
    } catch {
      toast.error("Upload failed — check your connection");
    } finally {
      setUploading(false);
    }
  }, [clubId, onLogoChange, update]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/logo`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to remove logo");
        return;
      }
      onLogoChange(null);
      await update();
      toast.success("Logo removed");
    } catch {
      toast.error("Failed to remove logo — check your connection");
    } finally {
      setRemoving(false);
    }
  }, [clubId, onLogoChange, update]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }, [handleFile]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <ClubLogo name={clubName || "Club"} logoUrl={logoUrl} size="md" />
        {logoUrl && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? "Removing..." : "Remove logo"}
          </Button>
        )}
      </div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-gray-300 hover:border-gray-400"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={onInputChange}
          className="hidden"
        />
        <p className="text-sm text-gray-600">
          {uploading ? "Uploading..." : "Drop logo here or click to browse"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          PNG, JPEG, WebP, or SVG — max 2MB
        </p>
      </div>
    </div>
  );
}
