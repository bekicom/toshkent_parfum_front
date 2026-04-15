import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateCategoryMutation, useCreateSupplierMutation } from "../../context/service/master.service";
import { formatGroupedNumberInput, formatPercentInput, parseGroupedNumberInput, parsePercentInput } from "../../utils/format";
import { ModalShell } from "../modal/ModalShell";

const baseForm = {
  id: "",
  name: "",
  code: "",
  barcode: "",
  categoryId: "",
  supplierId: "",
  purchasePrice: "",
  markupPercent: "",
  retailPrice: "",
  paymentType: "naqd",
  paidAmount: "",
  quantity: "",
  unit: "dona",
  allowPieceSale: false,
  pieceUnit: "dona",
  pieceQtyPerBase: "",
  piecePrice: "",
};

function getRelationId(value) {
  return typeof value === "object" ? value?._id || "" : value || "";
}

function getRelationName(value) {
  return typeof value === "object" ? value?.name || "" : "";
}

function generateProductCode(products = []) {
  const usedCodes = new Set(
    products
      .map((item) => String(item?.code || "").trim())
      .filter((code) => /^\d{4}$/.test(code)),
  );

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!usedCodes.has(code)) return code;
  }

  return String(Math.floor(1000 + Math.random() * 9000));
}

function SearchableDropdown({
  label,
  value,
  items,
  query,
  setQuery,
  open,
  setOpen,
  onSelect,
  onAdd,
  placeholder = "Tanlang",
}) {
  return (
    <div className="select-create-block">
      <div className="select-create-head">
        <span>{label}</span>
        <button type="button" className="tiny-icon-btn" onClick={onAdd}>+</button>
      </div>

      <div className={`dropdown-shell ${open ? "open" : ""}`.trim()}>
        <button
          type="button"
          className="dropdown-trigger"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span>{value || placeholder}</span>
          <span className="dropdown-caret">v</span>
        </button>

        {open ? (
          <div className="dropdown-panel">
            <input
              autoFocus
              className="mini-search-input"
              placeholder="Qidirish..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="dropdown-options">
              {items.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  className="dropdown-option"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  {item.name}
                </button>
              ))}
              {!items.length ? <div className="dropdown-empty">Topilmadi</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function toFormData(current) {
  if (!current) return baseForm;

  const nextUnit = current.unit === "razmer" ? "dona" : (current.unit || "dona");
  return {
    id: current._id,
    name: current.name || "",
    code: current.code || "",
    barcode: current.barcode || "",
    categoryId: getRelationId(current.categoryId),
    supplierId: getRelationId(current.supplierId),
    purchasePrice: current.purchasePrice ?? "",
    markupPercent:
      current.purchasePrice > 0 && current.retailPrice >= current.purchasePrice
        ? String(Math.round((((current.retailPrice - current.purchasePrice) / current.purchasePrice) * 100) * 100) / 100)
        : "",
    retailPrice: current.retailPrice ?? "",
    paymentType: current.paymentType || "naqd",
    paidAmount: current.paidAmount ?? "",
    quantity: current.quantity ?? "",
    unit: nextUnit,
    allowPieceSale: Boolean(current.allowPieceSale),
    pieceUnit: current.pieceUnit || "dona",
    pieceQtyPerBase: current.pieceQtyPerBase ?? "",
    piecePrice: current.piecePrice ?? "",
  };
}

function handleGroupedNumberChange(setter, field) {
  return (event) => {
    setter((prev) => ({
      ...prev,
      [field]: formatGroupedNumberInput(event.target.value),
    }));
  };
}

function calculateRetailPriceFromMarkup(purchasePriceInput, markupPercentInput) {
  const purchasePrice = parseGroupedNumberInput(purchasePriceInput);
  const markupPercent = parsePercentInput(markupPercentInput);
  if (!purchasePrice || markupPercent < 0) return "";
  return formatGroupedNumberInput(Math.round(purchasePrice * (1 + markupPercent / 100)));
}

function calculateMarkupPercentFromPrices(purchasePriceInput, retailPriceInput) {
  const purchasePrice = parseGroupedNumberInput(purchasePriceInput);
  const retailPrice = parseGroupedNumberInput(retailPriceInput);
  if (!purchasePrice || retailPrice < purchasePrice) return "";

  const percent = ((retailPrice - purchasePrice) / purchasePrice) * 100;
  return formatPercentInput(String(Math.round(percent * 100) / 100));
}

function fillFormFromProduct(product, categories, suppliers) {
  const next = toFormData(product);
  if (!next.categoryId && categories[0]?._id) next.categoryId = categories[0]._id;
  if (!next.supplierId && suppliers[0]?._id) next.supplierId = suppliers[0]._id;
  return next;
}

function fillFormFromBarcodeMatch(product, categories, suppliers) {
  const next = fillFormFromProduct(product, categories, suppliers);
  return {
    ...next,
    purchasePrice: "",
    retailPrice: "",
    paidAmount: "",
    quantity: "",
    piecePrice: "",
    pieceQtyPerBase: "",
    variantStocks: [],
  };
}

export function ProductModal({ open, current, products = [], categories, suppliers, onClose, onSubmit, loading }) {
  const [form, setForm] = useState(baseForm);
  const priceSyncReadyRef = useRef(false);
  const priceSyncSourceRef = useRef(null);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [showCategoryCreate, setShowCategoryCreate] = useState(false);
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", address: "" });
  const [inlineError, setInlineError] = useState("");
  const [createCategory, { isLoading: creatingCategory }] = useCreateCategoryMutation();
  const [createSupplier, { isLoading: creatingSupplier }] = useCreateSupplierMutation();

  useEffect(() => {
    priceSyncReadyRef.current = false;
    priceSyncSourceRef.current = null;
    if (!open) return;
    const next = fillFormFromProduct(current, categories, suppliers);
    if (!current) {
      next.code = generateProductCode(products);
    } else if (!next.code) {
      next.code = generateProductCode(products);
    }
    setForm(next);
    setCategoryQuery("");
    setSupplierQuery("");
    setCategoryOpen(false);
    setSupplierOpen(false);
    setShowCategoryCreate(false);
    setShowSupplierCreate(false);
    setNewCategoryName("");
    setNewSupplier({ name: "", phone: "", address: "" });
    setInlineError("");

    const timer = window.setTimeout(() => {
      priceSyncReadyRef.current = true;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, current, categories, suppliers]);

  useEffect(() => {
    if (!open || current) return;
    const barcode = String(form.barcode || "").trim();
    if (!barcode) return;

    const matchedProduct = products.find((item) => String(item.barcode || "").trim() === barcode);
    if (!matchedProduct) return;

    setForm((prev) => {
      if ((prev.id && prev.id === matchedProduct._id) || prev.name || prev.code || prev.purchasePrice || prev.retailPrice || prev.quantity) {
        return prev.id === matchedProduct._id ? prev : fillFormFromBarcodeMatch(matchedProduct, categories, suppliers);
      }

      return fillFormFromBarcodeMatch(matchedProduct, categories, suppliers);
    });
  }, [form.barcode, open, current, products, categories, suppliers]);

  const productNameOptions = useMemo(
    () => [...new Set(products.map((item) => String(item.name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const selectedCategoryName = categories.find((item) => item._id === form.categoryId)?.name || getRelationName(current?.categoryId);
  const selectedSupplierName = suppliers.find((item) => item._id === form.supplierId)?.name || getRelationName(current?.supplierId);

  const filteredCategories = useMemo(
    () => categories.filter((item) => item.name.toLowerCase().includes(categoryQuery.toLowerCase())),
    [categories, categoryQuery],
  );

  const filteredSuppliers = useMemo(
    () => suppliers.filter((item) => [item.name, item.phone, item.address].join(" ").toLowerCase().includes(supplierQuery.toLowerCase())),
    [suppliers, supplierQuery],
  );

  useEffect(() => {
    if (!priceSyncReadyRef.current) return;
    if (priceSyncSourceRef.current === "retail") return;
    if (form.markupPercent === "") return;
    const nextRetailPrice = calculateRetailPriceFromMarkup(form.purchasePrice, form.markupPercent);
    setForm((prev) => (prev.retailPrice === nextRetailPrice ? prev : { ...prev, retailPrice: nextRetailPrice }));
  }, [form.purchasePrice, form.markupPercent]);

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setInlineError("");
    try {
      const response = await createCategory({ name }).unwrap();
      setForm((prev) => ({ ...prev, categoryId: response.category._id }));
      setNewCategoryName("");
      setShowCategoryCreate(false);
    } catch (error) {
      setInlineError(error?.data?.message || "Kategoriya saqlanmadi");
    }
  };

  const handleCreateSupplier = async () => {
    const name = newSupplier.name.trim();
    if (!name) return;
    setInlineError("");
    try {
      const response = await createSupplier({
        name,
        phone: newSupplier.phone,
        address: newSupplier.address,
      }).unwrap();
      setForm((prev) => ({ ...prev, supplierId: response.supplier._id }));
      setNewSupplier({ name: "", phone: "", address: "" });
      setShowSupplierCreate(false);
    } catch (error) {
      setInlineError(error?.data?.message || "Yetkazib beruvchi saqlanmadi");
    }
  };

  return (
    <>
      <ModalShell open={open} title={current ? "Mahsulotni tahrirlash" : "Yangi mahsulot"} onClose={onClose} width="1040px">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              ...form,
              code: String(form.code || "").trim(),
              purchasePrice: parseGroupedNumberInput(form.purchasePrice),
              retailPrice: parseGroupedNumberInput(form.retailPrice),
              paidAmount: parseGroupedNumberInput(form.paidAmount),
              wholesalePrice: parseGroupedNumberInput(form.retailPrice),
              quantity: Number(form.quantity),
              pieceQtyPerBase: Number(form.pieceQtyPerBase || 0),
              piecePrice: parseGroupedNumberInput(form.piecePrice),
            });
          }}
        >
          <label>
            <span>Shtixkod</span>
            <input value={form.barcode} onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))} placeholder="Bo'sh qoldirilsa avtomatik" />
          </label>
          <label>
            <span>Nomi</span>
            <input
              list="product-name-options"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Mahsulot nomini kiriting"
              required
            />
            <datalist id="product-name-options">
              {productNameOptions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Kod</span>
            <input
              value={form.code}
              readOnly
              placeholder="Avtomatik 4 xonali kod"
            />
          </label>
        <SearchableDropdown
          label="Kategoriya"
          value={selectedCategoryName}
            items={filteredCategories}
            query={categoryQuery}
            setQuery={setCategoryQuery}
            open={categoryOpen}
            setOpen={setCategoryOpen}
            onSelect={(item) => setForm((prev) => ({ ...prev, categoryId: item._id }))}
            onAdd={() => setShowCategoryCreate(true)}
          />

          <SearchableDropdown
            label="Yetkazib beruvchi"
            value={selectedSupplierName}
            items={filteredSuppliers}
            query={supplierQuery}
            setQuery={setSupplierQuery}
            open={supplierOpen}
            setOpen={setSupplierOpen}
            onSelect={(item) => setForm((prev) => ({ ...prev, supplierId: item._id }))}
            onAdd={() => setShowSupplierCreate(true)}
          />

          <label>
            <span>Birligi</span>
            <select value={form.unit} onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}>
              <option value="dona">dona</option>
              <option value="komplekt">komplekt</option>
            </select>
          </label>
          <label>
            <span>Kelish narxi</span>
            <input
              type="text"
              inputMode="numeric"
              value={form.purchasePrice}
              onChange={(event) => {
                priceSyncSourceRef.current = "purchase";
                handleGroupedNumberChange(setForm, "purchasePrice")(event);
              }}
              required
            />
          </label>
          <label>
            <span>Ustama %</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.markupPercent}
              onChange={(event) => {
                priceSyncSourceRef.current = "markup";
                setForm((prev) => ({ ...prev, markupPercent: formatPercentInput(event.target.value) }));
              }}
              placeholder="Masalan 10"
            />
          </label>
          <label>
            <span>Sotish narxi</span>
            <input
            type="text"
            inputMode="numeric"
            value={form.retailPrice}
            onChange={(event) => {
              priceSyncSourceRef.current = "retail";
              const nextRetailPrice = formatGroupedNumberInput(event.target.value);
              setForm((prev) => ({
                ...prev,
                  retailPrice: nextRetailPrice,
                  markupPercent: calculateMarkupPercentFromPrices(prev.purchasePrice, nextRetailPrice),
                }));
              }}
              required
            />
          </label>
          <label>
            <span>To'lov turi</span>
            <select value={form.paymentType} onChange={(event) => setForm((prev) => ({ ...prev, paymentType: event.target.value }))}>
              <option value="naqd">naqd</option>
              <option value="qarz">qarz</option>
              <option value="qisman">qisman</option>
            </select>
          </label>
          <label>
            <span>To'langan summa</span>
            <input type="text" inputMode="numeric" value={form.paidAmount} onChange={handleGroupedNumberChange(setForm, "paidAmount")} disabled={form.paymentType === "naqd" || form.paymentType === "qarz"} />
          </label>
          <label>
            <span>Miqdori</span>
            <input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} required />
          </label>
          {inlineError ? <div className="error-box full-width">{inlineError}</div> : null}

          <div className="modal-footer full-width">
            <button type="button" className="ghost-btn" onClick={onClose}>Bekor qilish</button>
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={showCategoryCreate} title="Yangi kategoriya" onClose={() => setShowCategoryCreate(false)} width="460px">
        <div className="inline-create-box modal-inline-box">
          <input placeholder="Kategoriya nomi" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
          <div className="modal-footer">
            <button type="button" className="ghost-btn" onClick={() => setShowCategoryCreate(false)}>Bekor qilish</button>
            <button type="button" className="tiny-action-btn solid" onClick={handleCreateCategory} disabled={creatingCategory}>Saqlash</button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showSupplierCreate} title="Yangi yetkazib beruvchi" onClose={() => setShowSupplierCreate(false)} width="560px">
        <div className="inline-create-grid modal-inline-grid">
          <input placeholder="Ismi" value={newSupplier.name} onChange={(event) => setNewSupplier((prev) => ({ ...prev, name: event.target.value }))} />
          <input placeholder="Telefon" value={newSupplier.phone} onChange={(event) => setNewSupplier((prev) => ({ ...prev, phone: event.target.value }))} />
          <input placeholder="Manzil" value={newSupplier.address} onChange={(event) => setNewSupplier((prev) => ({ ...prev, address: event.target.value }))} />
          <div className="modal-footer full-width">
            <button type="button" className="ghost-btn" onClick={() => setShowSupplierCreate(false)}>Bekor qilish</button>
            <button type="button" className="tiny-action-btn solid" onClick={handleCreateSupplier} disabled={creatingSupplier}>Saqlash</button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
