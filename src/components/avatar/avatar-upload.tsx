"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { uploadAvatar, removeAvatar } from "@/lib/avatar/actions";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AvatarUpload({
  currentUrl,
  displayName,
}: {
  currentUrl: string | null;
  displayName: string;
}) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const shownUrl = preview ?? url;
  const initials = initialsOf(displayName);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2MB.");
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await uploadAvatar(formData);
      URL.revokeObjectURL(localPreview);
      setPreview(null);
      if (res.ok) {
        setUrl(res.url ?? null);
        toast.success("Profile photo updated.");
      } else {
        toast.error(res.error ?? "Upload failed.");
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await removeAvatar();
      if (res.ok) {
        setUrl(null);
        toast.success("Profile photo removed.");
      } else {
        toast.error(res.error ?? "Could not remove photo.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gold">
          <Camera className="size-5" />
          Profile photo
        </CardTitle>
        <CardDescription>
          Upload a photo so friends recognize you across leaderboards. PNG, JPG,
          WEBP or GIF, up to 2MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar size="lg" className="size-20 border border-border/60">
          {shownUrl && <AvatarImage src={shownUrl} alt={displayName} />}
          <AvatarFallback className="bg-primary/15 text-xl font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSelect}
            disabled={isPending}
          />
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
          >
            <Upload className="size-4" />
            {url ? "Change photo" : "Upload photo"}
          </Button>
          {url && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={isPending}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
