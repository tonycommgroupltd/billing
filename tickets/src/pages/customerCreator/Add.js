import React, { useState } from "react";
import { connect } from 'react-redux';
import { useNavigate } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../components/Component";
import { showError, showSuccess } from "../../utils/notifications";
import { normalizeKenyanPhone, kenyanPhonesMatch } from "../../utils/phone";
import { subjectWithInstallationPrice } from "../../utils/installationTicket";
import {
  INSTALLATION_TYPE_ID,
  INSTALLATION_2_TYPE_ID,
  getTypeLabelById,
  isStrictInstallationType,
  isInstallationWithPriceType,
} from "../../config/ticketTypes";
import { useActivityLogger, ACTIVITY_TYPES, TARGET_TYPES } from "../../hooks/useActivityLogger";

const CUSTOMER_CREATOR_TICKET_TYPES = [
  { value: INSTALLATION_TYPE_ID, label: "Installation" },
  { value: INSTALLATION_2_TYPE_ID, label: "Installation 2" },
];

const defaultTicketSubject = (typeLabel, name, phone, address) =>
  `${typeLabel} - ${name} - ${phone} - ${address || "Address TBD"}`;

const AddCustomerCreator = ({ user }) => {
  const navigate = useNavigate();
  const logActivity = useActivityLogger();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '', installation_price: '' });
  const [ticketTypeId, setTicketTypeId] = useState(INSTALLATION_TYPE_ID);
  const [files, setFiles] = useState([]);
  
  // Ticket editing fields
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketStatus] = useState('new'); // Fixed to 'new' only
  const [ticketAssignedTo] = useState(''); // Fixed to unassigned (empty) only

  const displayUser = (u) => u?.display_name || u?.name || u?.username || 'Unknown';
  const ticketTypeLabel = getTypeLabelById(ticketTypeId);
  const strictUniquePhone = isStrictInstallationType(ticketTypeId);
  const requiresInstallationPrice = isInstallationWithPriceType(ticketTypeId);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setForm(prev => ({ ...prev, [name]: value.replace(/\s/g, '') }));
    } else if (name === 'installation_price') {
      const cleaned = value.replace(/[^\d.]/g, '');
      setForm(prev => ({ ...prev, [name]: cleaned }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handlePhoneBlur = () => {
    const normalized = normalizeKenyanPhone(form.phone);
    if (normalized && normalized !== form.phone) {
      setForm(prev => ({ ...prev, phone: normalized }));
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...selectedFiles]);
    // Reset input to allow selecting same file again
    e.target.value = '';
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      showError('Please fill in at least the name and phone number');
      return;
    }

    const typeLabel = getTypeLabelById(ticketTypeId);
    const strictPhone = isStrictInstallationType(ticketTypeId);

    const priceStr = String(form.installation_price ?? '').trim();
    if (requiresInstallationPrice && (!priceStr || !Number.isFinite(parseFloat(priceStr)) || parseFloat(priceStr) < 0)) {
      showError('Please enter a valid installation price (KES)');
      return;
    }
    const installationPrice = parseFloat(priceStr);

    const normalizedPhone = normalizeKenyanPhone(form.phone);
    if (!normalizedPhone || !/^0[17]\d{8}$/.test(normalizedPhone)) {
      showError('Please enter a valid Kenyan phone number (e.g. 0712848481)');
      return;
    }
    setForm(prev => ({ ...prev, phone: normalizedPhone }));
    
    setLoading(true);
    try {
      const createdBy = displayUser(user);
      
      const { default: CustomerCreaterAPI } = await import('../../helpers/CustomerCreaterAPI');
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');

      // Installation only: phone must be unique (Installation 2 allows repeat bookings)
      if (strictPhone) {
        const { default: CustomersAPI } = await import('../../helpers/CustomersAPI');
        try {
          const customerCheck = await CustomersAPI.searchByPhone(normalizedPhone);
          if (customerCheck?.success && customerCheck?.found && customerCheck?.data) {
            showError(`Customer with phone number ${normalizedPhone} already exists in the system. First-time Installation tickets require a new phone number.`);
            setLoading(false);
            return;
          }
        } catch (checkError) {
          if (checkError.response?.status !== 404) {
            console.log('Customer check error:', checkError.message);
          }
        }

        try {
          const existingCreatorCheck = await CustomerCreaterAPI.list({
            search: normalizedPhone,
            per_page: 10
          });

          if (existingCreatorCheck?.success && existingCreatorCheck.data?.length > 0) {
            const matchingCreator = existingCreatorCheck.data.find((creator) =>
              kenyanPhonesMatch(creator.phone, normalizedPhone)
            );

            if (matchingCreator) {
              showError(`A customer request with phone number ${normalizedPhone} already exists. Please check the Customer Creator list.`);
              setLoading(false);
              return;
            }
          }
        } catch (creatorCheckError) {
          console.log('Customer creator check error:', creatorCheckError.message);
        }

        try {
          const existingTicketsCheck = await TicketsAPI.getAll({
            search: normalizedPhone,
            per_page: 10
          });

          if (existingTicketsCheck?.success && existingTicketsCheck.data?.length > 0) {
            const matchingTicket = existingTicketsCheck.data.find((ticket) =>
              kenyanPhonesMatch(
                ticket.customer_phone || ticket.customerPhone || ticket.customer?.phone,
                normalizedPhone
              )
            );

            if (matchingTicket) {
              showError(`Phone number ${normalizedPhone} already exists with ticket #${matchingTicket.number || matchingTicket.id}. Installation requires a unique phone number.`);
              setLoading(false);
              return;
            }
          }
        } catch (ticketCheckError) {
          console.log('Ticket check error:', ticketCheckError.message);
        }
      }

      const baseSubject =
        ticketSubject ||
        defaultTicketSubject(typeLabel, form.name, normalizedPhone, form.address);
      const ticketPayload = {
        subject: subjectWithInstallationPrice(baseSubject, installationPrice),
        description: `New ${typeLabel} request for ${form.name}\n\nPhone: ${normalizedPhone}\nInstallation price: KES ${installationPrice.toLocaleString('en-KE')}\nEmail: ${form.email || 'Not provided'}\nAddress: ${form.address || 'Address TBD'}\n\nCreated by: ${createdBy}`,
        status: ticketStatus, // Always 'new'
        priority: 'medium',
        type: typeLabel,
        installation_price: installationPrice,
        customerName: form.name,
        customerPhone: normalizedPhone,
        customerEmail: form.email || '',
        address: form.address || '',
        createdBy,
        assignedTo: '' // Unassigned initially
      };
      
      const ticketResp = await TicketsAPI.create(ticketPayload);
      const ticket = ticketResp.data;
      
      if (!ticket || !ticket.id) {
        throw new Error('Failed to create installation ticket');
      }
      
      // Step 2: Convert files to base64 if any
      let attachments = [];
      if (files.length > 0) {
        attachments = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            base64: await convertFileToBase64(file)
          }))
        );
      }
      
      // Step 3: Create customer creator entry with ticket reference
      // CustomerCreaterAPI is already imported above, reuse it
      const customerPayload = {
        ...form,
        phone: normalizedPhone,
        status: 'pending',
        ticket_id: ticket.id,
        createdBy,
        ticket_type: typeLabel,
        notes: `${typeLabel} ticket #${ticket.id} created. ${form.notes || ''}`.trim(),
        attachments: attachments
      };
      
      const resp = await CustomerCreaterAPI.create(customerPayload);
      
      // Log the customer creation activity
      await logActivity(
        ACTIVITY_TYPES.CUSTOMER_CREATED,
        `Created new customer ${typeLabel} request: ${form.name} (${normalizedPhone}) with ticket #${ticket.id}`,
        TARGET_TYPES.CUSTOMER,
        resp.data?.id || null
      );
      
      showSuccess(`Customer added successfully! ${typeLabel} ticket #${ticket.id} has been created and is awaiting assignment. You can track the progress in your Customer List.`);
      
      // Reset form and navigate
      setForm({ name: '', phone: '', email: '', address: '', notes: '', installation_price: '' });
      setTicketTypeId(INSTALLATION_TYPE_ID);
      setTicketSubject('');
      setFiles([]);
      navigate('/admin/customer-creater/list');
    } catch (e) {
      console.error('Failed to add customer', e);
      const errorMsg = e.response?.data?.error || e.message || 'Failed to add customer and create installation ticket';
      showError(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <React.Fragment>
      <Head title="Customer Creater - Add" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">Customer Creater</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Card>
            <div className="card-header"><strong>Add New Customer</strong></div>
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Name</label>
                    <input name="name" value={form.name} onChange={handleChange} className="form-control" required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Phone</label>
                    <input name="phone" type="tel" value={form.phone} onChange={handleChange} onBlur={handlePhoneBlur} className="form-control" placeholder="e.g. 0712848481" required />
                    <small className="text-muted">Saved as 07XXXXXXXX (254 / +254 formats are converted automatically)</small>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Installation price (KES)</label>
                    <input
                      name="installation_price"
                      type="text"
                      inputMode="decimal"
                      value={form.installation_price}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="e.g. 3000"
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input name="email" value={form.email} onChange={handleChange} className="form-control" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Address</label>
                    <input name="address" value={form.address} onChange={handleChange} className="form-control" />
                  </div>
                  <div className="col-md-12">
                    <label className="form-label">Notes (Optional)</label>
                    <textarea name="notes" value={form.notes} onChange={handleChange} className="form-control" rows="3" placeholder="Any additional information about the customer..."></textarea>
                  </div>
                  
                  {/* Ticket Information Section */}
                  <div className="col-md-12">
                    <hr className="my-4" />
                    <h6 style={{ color: '#0066cc', marginBottom: '16px' }}>
                      <Icon name="ticket" className="me-2" />
                      Ticket Settings
                    </h6>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Ticket type</label>
                    <select
                      className="form-control"
                      value={ticketTypeId}
                      onChange={(e) => {
                        setTicketTypeId(e.target.value);
                        setTicketSubject('');
                      }}
                    >
                      {CUSTOMER_CREATOR_TICKET_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <small className="text-muted">
                      {strictUniquePhone
                        ? 'Installation: phone must be new (not used before).'
                        : 'Installation 2: repeat bookings allowed for the same phone.'}
                    </small>
                  </div>
                  
                  <div className="col-md-12">
                    <label className="form-label">Ticket Subject (Optional)</label>
                    <input 
                      type="text"
                      value={ticketSubject} 
                      onChange={(e) => setTicketSubject(e.target.value)} 
                      className="form-control" 
                      placeholder={`Default: ${defaultTicketSubject(ticketTypeLabel, form.name || '[Name]', form.phone || '[Phone]', form.address)}`}
                    />
                    <small className="text-muted">Leave blank to use auto-generated subject</small>
                  </div>
                  
                  <div className="col-md-6">
                    <label className="form-label">Ticket Status</label>
                    <input 
                      type="text"
                      value="New" 
                      className="form-control" 
                      disabled
                      style={{ backgroundColor: '#f8f9fa', color: '#6c757d' }}
                    />
                    <small className="text-muted">Fixed to 'New' for new installations</small>
                  </div>
                  
                  <div className="col-md-6">
                    <label className="form-label">Assigned To</label>
                    <input 
                      type="text"
                      value="Unassigned" 
                      className="form-control" 
                      disabled
                      style={{ backgroundColor: '#f8f9fa', color: '#6c757d' }}
                    />
                    <small className="text-muted">Fixed to 'Unassigned' for new tickets</small>
                  </div>
                  
                  <div className="col-md-12">
                    <label className="form-label">Attachments (Optional)</label>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="form-control"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                    />
                    {files.length > 0 && (
                      <div className="mt-2">
                        {files.map((file, index) => (
                          <div key={index} className="d-flex align-items-center justify-content-between mb-2 p-2 border rounded" style={{backgroundColor: '#f8f9fa'}}>
                            <div className="d-flex align-items-center">
                              <Icon name="file" className="me-2" />
                              <span style={{fontSize: '14px'}}>{file.name}</span>
                              <span className="text-muted ms-2" style={{fontSize: '12px'}}>
                                ({(file.size / 1024).toFixed(2)} KB)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(index)}
                              className="btn btn-sm btn-outline-danger"
                            >
                              <Icon name="cross" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <Button type="submit" className={`btn btn-primary ${loading ? 'disabled' : ''}`} disabled={loading}>
                    {loading ? <Icon name="loader" className="spinning" /> : `Add Customer & Create ${ticketTypeLabel} Ticket`}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(AddCustomerCreator);
