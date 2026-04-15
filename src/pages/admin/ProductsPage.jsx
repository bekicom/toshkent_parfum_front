import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/page_header/PageHeader";
import { PageLoader } from "../../components/loading/PageLoader";
import { ProductModal } from "../../components/addproduct/ProductModal";
import { RestockModal } from "../../components/addproduct/RestockModal";
import { ProductDetailModal } from "../../components/addproduct/ProductDetailModal";
import { PrintBarcodeModal } from "../../components/print/PrintBarcodeModal";
import { BulkPrintBarcodeModal } from "../../components/print/BulkPrintBarcodeModal";
import { ProductsTable } from "../../components/table/ProductsTable";
import {
  useCreateProductMutation,
  useDeleteProductMutation,
  useGetProductsQuery,
  useRestockProductMutation,
  useUpdateProductMutation,
} from "../../context/service/addproduct.service";
import { useGetCategoriesQuery, useGetSuppliersQuery } from "../../context/service/master.service";
import { getApiErrorMessage } from "../../context/loading";

const PRODUCTS_PER_PAGE = 12;

export function ProductsPage() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState({
    productOpen: false,
    editTarget: null,
    restockTarget: null,
    detailTarget: null,
    printTarget: null,
    bulkPrintOpen: false,
  });
  const [pageError, setPageError] = useState("");

  const { data: categoriesRes } = useGetCategoriesQuery();
  const { data: suppliersRes } = useGetSuppliersQuery();
  const { data: productsRes, isLoading } = useGetProductsQuery({ q: query, categoryId });
  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: updating }] = useUpdateProductMutation();
  const [deleteProduct] = useDeleteProductMutation();
  const [restockProduct, { isLoading: restocking }] = useRestockProductMutation();

  const categories = categoriesRes?.categories || [];
  const suppliers = suppliersRes?.suppliers || [];
  const products = useMemo(() => productsRes?.products || [], [productsRes]);
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = useMemo(
    () => products.slice((safePage - 1) * PRODUCTS_PER_PAGE, safePage * PRODUCTS_PER_PAGE),
    [products, safePage],
  );

  useEffect(() => {
    setPage(1);
  }, [query, categoryId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const saveProduct = async (payload) => {
    setPageError("");
    try {
      const response = payload.id
        ? await updateProduct({ id: payload.id, ...payload }).unwrap()
        : await createProduct(payload).unwrap();
        setModalState({
          productOpen: false,
          editTarget: null,
          restockTarget: null,
          detailTarget: null,
          printTarget: response.product,
          bulkPrintOpen: false,
        });
    } catch (error) {
      setPageError(getApiErrorMessage(error));
    }
  };

  const submitRestock = async (payload) => {
    if (!modalState.restockTarget) return;
    setPageError("");
    try {
      await restockProduct({ id: modalState.restockTarget._id, ...payload }).unwrap();
      setModalState((prev) => ({ ...prev, restockTarget: null }));
    } catch (error) {
      setPageError(getApiErrorMessage(error));
    }
  };

  const removeProduct = async (id) => {
    if (!window.confirm("Mahsulotni o'chirmoqchimisiz?")) return;
    setPageError("");
    try {
      await deleteProduct(id).unwrap();
    } catch (error) {
      setPageError(getApiErrorMessage(error));
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="page-stack">
      <PageHeader
        title="Mahsulotlar"
        subtitle="Skladga mahsulot qo'shish va kirim bilan ishlash"
        actions={(
          <div className="page-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setModalState((prev) => ({ ...prev, bulkPrintOpen: true }))}
            >
              Pechat
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setModalState({ productOpen: true, editTarget: null, restockTarget: null, detailTarget: null, printTarget: null, bulkPrintOpen: false })}
            >
              + Mahsulot qo'shish
            </button>
          </div>
        )}
      />

      <section className="filters-row">
        <input className="search-input" placeholder="Qidirish..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="search-input narrow" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Barcha kategoriyalar</option>
          {categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select>
      </section>

      {pageError ? <div className="error-box">{pageError}</div> : null}

      <ProductsTable
        products={pagedProducts}
        onEdit={(item) => setModalState({ productOpen: true, editTarget: item, restockTarget: null, detailTarget: null, printTarget: null, bulkPrintOpen: false })}
        onDelete={removeProduct}
        onRestock={(item) => setModalState({ productOpen: false, editTarget: null, restockTarget: item, detailTarget: null, printTarget: null, bulkPrintOpen: false })}
        onView={(item) => setModalState((prev) => ({ ...prev, detailTarget: item }))}
        onPrint={(item) => setModalState((prev) => ({ ...prev, printTarget: item }))}
      />

      {products.length > PRODUCTS_PER_PAGE ? (
        <section className="table-pagination-wrap">
          <div className="table-pagination">
            <button
              type="button"
              className="ghost-btn small"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
            >
              Oldingi
            </button>
            <span>{safePage} / {totalPages}</span>
            <button
              type="button"
              className="ghost-btn small"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
            >
              Keyingi
            </button>
          </div>
        </section>
      ) : null}

      <ProductModal
        open={modalState.productOpen}
        current={modalState.editTarget}
        products={products}
        categories={categories}
        suppliers={suppliers}
        onClose={() => setModalState((prev) => ({ ...prev, productOpen: false, editTarget: null }))}
        onSubmit={saveProduct}
        loading={creating || updating}
      />

      <RestockModal
        open={Boolean(modalState.restockTarget)}
        product={modalState.restockTarget}
        suppliers={suppliers}
        onClose={() => setModalState((prev) => ({ ...prev, restockTarget: null }))}
        onSubmit={submitRestock}
        loading={restocking}
      />

      <ProductDetailModal
        open={Boolean(modalState.detailTarget)}
        product={modalState.detailTarget}
        onClose={() => setModalState((prev) => ({ ...prev, detailTarget: null }))}
      />

      <PrintBarcodeModal
        open={Boolean(modalState.printTarget)}
        product={modalState.printTarget}
        onClose={() => setModalState((prev) => ({ ...prev, printTarget: null }))}
      />

      <BulkPrintBarcodeModal
        open={Boolean(modalState.bulkPrintOpen)}
        products={products}
        onClose={() => setModalState((prev) => ({ ...prev, bulkPrintOpen: false }))}
      />
    </div>
  );
}
