import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * The signed-in administrator's own account.
 *
 * Deliberately shaped so `passwordHash` is not in the select at all: it cannot
 * be rendered or logged by accident. Only the identity fields the settings
 * screen displays are returned (AGENTS.md sections 7 and 8).
 */
export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export async function getAdminAccount(
  userId: string,
): Promise<AdminAccount | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}