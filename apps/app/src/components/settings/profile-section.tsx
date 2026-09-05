"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@acme/ui";
import { accountFormSchema, profileFormSchema } from "@acme/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { orpc } from "~/orpc/react";

const languages = [
  { label: "Русский", value: "ru" },
  { label: "English", value: "en" },
  { label: "Français", value: "fr" },
  { label: "Deutsch", value: "de" },
  { label: "Español", value: "es" },
  { label: "Português", value: "pt" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "中文", value: "zh" },
];

const profileSectionSchema = z.object({
  name: accountFormSchema.shape.name,
  language: accountFormSchema.shape.language,
  username: profileFormSchema.shape.username,
  email: profileFormSchema.shape.email,
  bio: profileFormSchema.shape.bio,
});

type ProfileSectionValues = z.infer<typeof profileSectionSchema>;

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function ProfileSection({
  initialData,
}: {
  initialData: ProfileSectionValues;
}) {
  const queryClient = useQueryClient();

  const form = useForm<ProfileSectionValues>({
    resolver: zodResolver(profileSectionSchema),
    defaultValues: initialData,
  });

  const updateProfileSettings = useMutation(
    orpc.user.updateProfileSettings.mutationOptions(),
  );

  const isPending = updateProfileSettings.isPending;

  async function onSubmit(data: ProfileSectionValues) {
    try {
      await updateProfileSettings.mutateAsync(data);
      toast.success("Профиль обновлён");
      await queryClient.invalidateQueries({ queryKey: orpc.user.key() });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось сохранить изменения",
      );
    }
  }

  const name = form.watch("name");

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Личная информация</CardTitle>
        <CardDescription>
          Обновите контактные данные и язык интерфейса.
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="flex flex-wrap items-center gap-4 border-b py-6">
            <div className="bg-brand-soft text-brand flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-lg font-semibold">
              {getInitials(name || "")}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Фото профиля</span>
              <span className="text-muted-foreground text-xs">
                Инициалы формируются из вашего имени
              </span>
            </div>
          </CardContent>

          <CardContent className="grid gap-5 py-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    Имя
                  </FormLabel>
                  <Input placeholder="Ваше имя" {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    Имя пользователя
                  </FormLabel>
                  <Input placeholder="ivan_ivanov" {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-foreground font-medium">
                    Email
                  </FormLabel>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    {...field}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-foreground font-medium">
                    О себе
                  </FormLabel>
                  <Textarea
                    placeholder="Коротко расскажите о себе"
                    className="resize-none"
                    {...field}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-foreground font-medium">
                    Язык интерфейса
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-64">
                      <SelectValue placeholder="Выберите язык" />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((language) => (
                        <SelectItem key={language.value} value={language.value}>
                          {language.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>

          <CardFooter className="justify-end border-t py-5">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
