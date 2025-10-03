// src/features/auth/ui/EditProfileModal.tsx

import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar, Button, Modal, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconUpload } from "@tabler/icons-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";

export function EditProfileModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const user = useQuery(api.users.getCurrentUser);
  const [name, setName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const updateUserProfile = useMutation(api.users.updateUserProfile);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (opened && user) {
      setName(user.name ?? "");
      setAvatarFile(null);
    }
  }, [opened, user]);

  const previewUrl = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : null), [avatarFile]);

  const initials = useMemo(() => {
    const src = (user?.name || user?.email || "?").trim();
    const parts = src.includes("@")
      ? src
          .split("@")[0]
          .split(/[.\s_+-]+/)
          .filter(Boolean)
      : src.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "?";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }, [user?.name, user?.email]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      notifications.show({
        title: "File Too Large",
        message: "Avatar size must be at most 5MB.",
        color: "red",
      });
      return;
    }
    setAvatarFile(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    try {
      let storageId: string | undefined;
      if (avatarFile) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": avatarFile.type },
          body: avatarFile,
        });
        const { storageId: uploadedStorageId } = await result.json();
        storageId = uploadedStorageId;
      }

      await updateUserProfile({
        name: name.trim(),
        ...(storageId && { storageId }),
      });

      notifications.show({
        title: "Profile Updated",
        message: "Your profile information has been saved.",
        color: "green",
      });
      onClose();
    } catch (_error) {
      notifications.show({
        title: "Failed to Update Profile",
        message: "An error occurred while saving changes.",
        color: "red",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges = avatarFile !== null || (user && name.trim() !== (user.name ?? ""));
  const isNameValid = name.trim().length > 0;
  const canSubmit = hasChanges && isNameValid && !isSubmitting;

  return (
    <Modal opened={opened} onClose={onClose} centered size="md" withCloseButton={false} radius={10} padding={"lg"}>
      <form onSubmit={handleSubmit}>
        <div className="mb-6 flex flex-col items-center gap-4">
          <Avatar src={previewUrl ?? user?.image ?? undefined} alt={user?.name ?? ""} size={112} radius={100}>
            {initials}
          </Avatar>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png,image/jpeg" className="hidden" />
          <Button variant="default" onClick={() => fileInputRef.current?.click()} leftSection={<IconUpload size={16} />}>
            Upload Avatar
          </Button>
        </div>

        <div className="mb-6">
          <TextInput
            label="Name"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!isNameValid ? "Name cannot be empty" : null}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={!canSubmit} className="w-[130px]">
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
