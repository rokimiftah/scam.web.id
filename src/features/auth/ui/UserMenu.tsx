// src/features/auth/ui/UserMenu.tsx

import { useMemo, useState } from "react";

import { useAuthActions } from "@convex-dev/auth/react";
import { Avatar, Menu } from "@mantine/core";
import { useQuery } from "convex/react";
import { useLocation } from "wouter";

import { api } from "../../../../convex/_generated/api";
import { EditProfileModal } from "./EditProfileModal";

export function UserMenu() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.getCurrentUser);
  const [, navigate] = useLocation();
  const [editModalOpen, setEditModalOpen] = useState(false);

  const name = (user?.name ?? "").trim();
  const email = (user?.email ?? "").trim();
  const hasName = !!name;
  const image = typeof user?.image === "string" ? user.image : undefined;

  const initials = useMemo(() => {
    const src = (name || email || "?").trim();
    const parts = src.includes("@")
      ? src
          .split("@")[0]
          .split(/[.\s_+-]+/)
          .filter(Boolean)
      : src.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "?";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }, [name, email]);

  return (
    <>
      <Menu position="bottom" withArrow>
        <Menu.Target>
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="Account menu"
              className={[
                "inline-grid cursor-pointer place-items-center rounded-full p-1",
                "bg-[linear-gradient(to_bottom,#ed1c24_50%,#ffffff_50%)]",
                "ring-0 outline-none focus:ring-0 focus:outline-none focus-visible:ring-0",
              ].join(" ")}
            >
              <Avatar src={image} radius="xl" size={40} className="rounded-full bg-white" alt={hasName ? name : email || "User"}>
                {!image ? initials : null}
              </Avatar>
            </button>
          </div>
        </Menu.Target>

        <Menu.Dropdown>
          <div className="px-2 pt-1 pb-1.5">
            {hasName ? (
              <>
                <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={name}>
                  {name}
                </div>
                {email && (
                  <div className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={email}>
                    {email}
                  </div>
                )}
              </>
            ) : (
              <div className="truncate text-sm text-zinc-700 dark:text-zinc-200" title={email}>
                {email || "Pengguna"}
              </div>
            )}
          </div>

          <Menu.Divider />

          <Menu.Item onClick={() => setEditModalOpen(true)}>Edit Profile</Menu.Item>

          <Menu.Divider />

          <Menu.Item
            onClick={async () => {
              try {
                await signOut();
              } finally {
                navigate("/sign-in", { replace: true });
              }
            }}
          >
            Sign Out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <EditProfileModal opened={editModalOpen} onClose={() => setEditModalOpen(false)} />
    </>
  );
}
