import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
const baseUrl =
  import.meta.env.MODE === "production"
    ? rawBaseUrl && rawBaseUrl !== "/api"
      ? rawBaseUrl
      : "https://toshkent-parfum-backend-z6ig.vercel.app/api"
    : rawBaseUrl || "/api";

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers) => {
    const token = localStorage.getItem("sklad_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithReauth = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);

  if (result?.error?.status === 401) {
    localStorage.removeItem("sklad_token");
    localStorage.removeItem("sklad_user");
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Auth",
    "Dashboard",
    "Category",
    "Supplier",
    "SupplierDetail",
    "Product",
    "Purchase",
    "Transfer",
    "Store",
  ],
  endpoints: () => ({}),
});
