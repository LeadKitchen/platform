"use client";

import { Button, Input, Label, Textarea, toast } from "@acme/ui";
import { type ProfileFormValues, profileFormSchema } from "@acme/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { orpc } from "~/orpc/react";

export function ProfileForm({
  initialData,
}: {
  initialData?: ProfileFormValues;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: initialData || {
      username: "",
      email: "",
      bio: "",
    },
    mode: "onChange",
  });

  const updateProfile = useMutation({
    ...orpc.user.updateProfile.mutationOptions(),
    onSuccess: async () => {
      toast.success("Профиль обновлён");
      await queryClient.invalidateQueries({
        queryKey: orpc.user.key(),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Не удалось обновить профиль");
    },
  });

  function onSubmit(data: ProfileFormValues) {
    updateProfile.mutate(data);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 border-b pb-6">
        <div className="bg-brand-soft text-brand flex h-16 w-16 items-center justify-center rounded-xl">
          {avatarUrl ? (
            <Image
              src={avatarUrl || "/placeholder.svg"}
              alt="Avatar"
              width={64}
              height={64}
              className="h-16 w-16 rounded-xl object-cover"
            />
          ) : (
            <User className="h-7 w-7" />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById("avatar-upload")?.click()}
        >
          Загрузить фото
        </Button>
        <input
          id="avatar-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const url = URL.createObjectURL(file);
              setAvatarUrl(url);
            }
          }}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username">Имя пользователя</Label>
          <Input
            id="username"
            placeholder="ivan_ivanov"
            {...form.register("username")}
          />
          <p className="text-muted-foreground text-sm">
            Отображается в интерфейсе игры и списке ведущих.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="email@example.com"
            {...form.register("email")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">О себе</Label>
        <Textarea
          id="bio"
          placeholder="Коротко расскажите о себе"
          className="resize-none"
          {...form.register("bio")}
        />
      </div>

      <Button type="submit" disabled={updateProfile.isPending}>
        {updateProfile.isPending ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
