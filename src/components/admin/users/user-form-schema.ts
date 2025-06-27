
import { z } from 'zod';

export const userFormSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  confirmPassword: z.string(),
  roleId: z.string({ required_error: "Role is required" }).min(1, "Role is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const updateUserFormSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().optional().refine(val => !val || val.length === 0 || val.length >= 6, {
    message: "Password must be at least 6 characters if provided",
  }),
  confirmPassword: z.string().optional(),
  roleId: z.string({ required_error: "Role is required" }).min(1, "Role is required"),
}).refine((data) => {
  if (data.password && data.password.trim() !== '') {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export type UserFormValues = z.infer<typeof userFormSchema>;
export type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>;
