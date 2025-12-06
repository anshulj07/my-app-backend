export type AppUserDoc = {
  clerkUserId: string;

  clerk: {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
    createdAt: number | null; // Clerk created_at (ms)
  };

  profile: {
    firstName: string | null;
    lastName: string | null;
    about: string | null;
    gender: string | null;
    age: number | null;
    interests: string[];
    photos: string[];
    location: {
      lat: number | null;
      lng: number | null;
      city: string | null;
      country: string | null;
    } | null;
  };

  payment: {
    status: "free" | "trial" | "active" | "past_due" | "canceled";
    plan: string | null;
    provider: "stripe" | null;
    customerId: string | null;
    subscriptionId: string | null;
    currentPeriodEnd: string | null;
  };

  moderation: { banned: boolean; banReason: string | null };

  verification: {
    emailVerified: boolean | null;
    idVerified: boolean | null;
    photoVerified: boolean | null;
  };

  onboarding: {
    step:
      | "none"
      | "name"
      | "dateOfBirth"
      | "gender"
      | "interests"
      | "about"
      | "photos"
      | "complete";
    completed: boolean;
  };
  
  isDeleted: boolean;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * Insert-only defaults.
 * IMPORTANT: Do NOT include `clerk` here (webhook $set will always provide it),
 * otherwise you'll conflict with updates that set clerk.* or clerk.
 */
export function buildUserInsertDefaults(params: { clerkUserId: string }) {
  return {
    clerkUserId: params.clerkUserId,

    profile: {
      firstName: null,
      lastName: null,
      about: null,
      gender: null,
      age: null,
      interests: [],
      photos: [],
      location: null,
    },

    payment: {
      status: "free",
      plan: null,
      provider: null,
      customerId: null,
      subscriptionId: null,
      currentPeriodEnd: null,
    },

    moderation: {
      banned: false,
      banReason: null,
    },

    verification: {
      emailVerified: null,
      idVerified: null,
      photoVerified: null,
    },

    onboarding: {
      step: "none",
      completed: false,
    },

    // don't set updatedAt/isDeleted here; webhook $set handles those
    createdAt: new Date(),
    deletedAt: null,
  };
}
