import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Block, BlockHead, BlockHeadContent, BlockTitle, BlockDes, RSelect, Icon, Col, Row, PreviewCard } from "../../components/Component";
import { ROLES } from "../../config/roles";
import {
  TICKET_TYPES,
  isStrictInstallationType,
  isInstallationWithPriceType,
} from "../../config/ticketTypes";
import TicketsAPI from "../../helpers/TicketsAPI";
import CustomersAPI from "../../helpers/CustomersAPI";
import { showError, showSuccess } from "../../utils/notifications";
import { normalizeKenyanPhone, kenyanPhonesMatch } from "../../utils/phone";

/** Append KES price to subject for installation tickets (avoids duplicate suffix). */
const subjectWithInstallationPrice = (subject, price) => {
  const base = String(subject || "").trim();
  const amount = Number(price);
  if (!base || !Number.isFinite(amount)) return base;
  const priceTag =
    amount % 1 === 0
      ? `KES ${amount.toLocaleString("en-KE")}`
      : `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (base.includes(priceTag) || new RegExp(`KES\\s*${amount}`, "i").test(base)) {
    return base;
  }
  return `${base} - ${priceTag}`;
};

const CreateTicket = () => {
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.currentUser);
  const [formData, setFormData] = useState({
    customer_id: "",
    customer_phone: "",
    customer_name: "",
    hidden: false,
    assign_to: [],
    group_id: "",
    watchers: [],
    mail_cc: "",
    priority: "low",
    status_id: "1",
    type_id: "1",
    installation_price: "",
    subject: "",
    message: ""
  });

  const [assignToOptions, setAssignToOptions] = useState([{ value: "0", label: "Unassigned" }]);
  const [watcherOptions, setWatcherOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerFound, setCustomerFound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [customerTickets, setCustomerTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestionRef = useRef(null);
  const phoneInputRef = useRef(null);
  const debounceRef = useRef(null);

  // Close suggestion dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target) &&
          phoneInputRef.current && !phoneInputRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setActiveSuggestion(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live search for suggestions as user types
  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggestionLoading(true);
    try {
      const response = await CustomersAPI.searchCustomers(query, 8);
      const customers = response?.data || [];
      setSuggestions(customers);
      setShowSuggestions(customers.length > 0);
    } catch (e) {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setSuggestionLoading(false);
    }
  }, []);

  // Select a customer from the suggestion dropdown
  const selectSuggestion = (customer) => {
    const phone = normalizeKenyanPhone(customer.phone_number || customer.phone || customer.mobile || '');
    const name = customer.name || customer.full_name || '';
    setFormData(prev => ({
      ...prev,
      customer_phone: phone,
      customer_name: name,
      customer_id: customer.id ? customer.id.toString() : ''
    }));
    setCustomerFound(customer);
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveSuggestion(-1);
    // Fetch prior tickets for this customer
    if (phone) fetchCustomerTickets(phone);
  };

  // Fetch customer tickets when phone number is entered (includes archived)
  const fetchCustomerTickets = async (phoneNumber) => {
    if (!phoneNumber || phoneNumber.length < 10) {
      setCustomerTickets([]);
      return;
    }

    setLoadingTickets(true);
    try {
      // Search both active AND archived tickets by customer phone
      const [activeResp, archivedResp] = await Promise.allSettled([
        TicketsAPI.getAll({ search: phoneNumber, per_page: 50 }),
        TicketsAPI.getArchived({ search: phoneNumber, per_page: 50 })
      ]);

      const active   = activeResp.status   === 'fulfilled' ? (activeResp.value?.data   || activeResp.value?.tickets   || []) : [];
      const archived = archivedResp.status === 'fulfilled' ? (archivedResp.value?.data || archivedResp.value?.tickets || []) : [];

      // Mark archived ones so UI can show the badge
      const archivedTagged = archived.map(t => ({ ...t, _archived: true }));

      // Merge, most-recent first
      const all = [...active, ...archivedTagged].sort((a, b) =>
        new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
      );

      setCustomerTickets(all);
    } catch (error) {
      console.error('Error fetching customer tickets:', error);
      setCustomerTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleCustomerPhoneBlur = () => {
    const normalized = normalizeKenyanPhone(formData.customer_phone);
    if (normalized && normalized !== formData.customer_phone) {
      setFormData(prev => ({ ...prev, customer_phone: normalized }));
      if (normalized.length >= 10) {
        fetchCustomerTickets(normalized);
      }
    }
  };

  // Handle customer/phone search using API
  const handleCustomerPhoneChange = async (value) => {
    setFormData(prev => ({
      ...prev,
      customer_phone: value,
      customer_id: "",
      customer_name: ""
    }));

    setCustomerFound(null);
    setCustomerTickets([]);
    setActiveSuggestion(-1);

    // Debounced live suggestions from 3 chars
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value && value.length >= 3) {
      debounceRef.current = setTimeout(() => fetchSuggestions(value), 280);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    // Full lookup when 10+ digits entered (existing behaviour)
    const lookupPhone = normalizeKenyanPhone(value) || value;
    if (lookupPhone && lookupPhone.length >= 10) {
      setSearchingCustomer(true);
      try {
        const response = await CustomersAPI.searchByPhone(lookupPhone);
        if (response.found && response.data) {
          const customer = response.data;
          setFormData(prev => ({
            ...prev,
            customer_id: customer.id.toString(),
            customer_name: customer.name || customer.full_name || "Customer"
          }));
          setCustomerFound(customer);
          setCustomerOptions([{
            value: customer.id.toString(),
            label: `${customer.name || customer.full_name} (${lookupPhone})`
          }]);
          setShowSuggestions(false);
          setSuggestions([]);
          if (lookupPhone !== value) {
            setFormData(prev => ({ ...prev, customer_phone: lookupPhone }));
          }
        } else {
          setFormData(prev => ({ ...prev, customer_name: `Phone: ${lookupPhone}`, customer_phone: lookupPhone }));
          setCustomerFound(null);
          setCustomerOptions([{ value: "phone_" + lookupPhone, label: `New Customer - Use Phone: ${lookupPhone}` }]);
        }
        await fetchCustomerTickets(lookupPhone);
      } catch (error) {
        console.error('Error searching customer:', error);
        setFormData(prev => ({ ...prev, customer_name: `Phone: ${lookupPhone}`, customer_phone: lookupPhone }));
        setCustomerFound(null);
        setCustomerOptions([{ value: "phone_" + lookupPhone, label: `Use Phone: ${lookupPhone}` }]);
        await fetchCustomerTickets(lookupPhone);
      } finally {
        setSearchingCustomer(false);
      }
    } else {
      setCustomerOptions([]);
      setCustomerFound(null);
    }
  };

  // Function to load users by role from working API endpoints
  const loadUsersByRole = async () => {
    try {
      // Load assignment options (technicians and engineers)
      const technicians = await TicketsAPI.getAssignmentOptions();
      if (technicians && technicians.length > 0) {
        setAssignToOptions([{ value: "0", label: "Unassigned" }, ...technicians]);
      }
      
      // Load watcher options (managers and administrators)
      const watchers = await TicketsAPI.getWatcherOptions();
      if (watchers && watchers.length > 0) {
        setWatcherOptions(watchers);
      }
      
    } catch (error) {
      console.error('Error loading users from API:', error);
    }
  };

  // Fallback function to read admins from localStorage  
  const loadFromLocalStorage = () => {
    try {
      const adminStore = localStorage.getItem('admin_store_v1');
      console.log('Admin store data:', adminStore); // Debug
      
      if (adminStore) {
        const parsedStore = JSON.parse(adminStore);
        const admins = parsedStore.items || [];
        console.log('All admins found:', admins); // Debug
        console.log('Admin roles found:', admins.map(a => a.role_name)); // Debug
        
        // Filter technicians and engineers for "Assigned to" - check all possible role name formats
        const assignees = admins.filter(admin => {
          const roleName = (admin.role_name || '').toLowerCase();
          return roleName === 'technician' || roleName === 'engineer' || 
                 roleName.includes('technician') || roleName.includes('engineer');
        });
        
        console.log('Filtered assignees:', assignees); // Debug
        
        const assignOptions = assignees.map(admin => ({
          value: admin.name || admin.id.toString(),
          label: `${admin.name} (${admin.email || admin.role_name})`
        }));
        
        setAssignToOptions(prev => [...prev, ...assignOptions]);
        
        // Managers and admins for watchers - check all possible role name formats
        const watchers = admins.filter(admin => {
          const roleName = (admin.role_name || '').toLowerCase();
          return roleName === 'manager' || roleName === 'administration' || 
                 roleName === 'super-administrator' || roleName === 'administrator' ||
                 roleName.includes('manager') || roleName.includes('admin');
        });
        
        console.log('Filtered watchers:', watchers); // Debug
        
        const watcherOpts = watchers.map(admin => ({
          value: admin.email || admin.id.toString(),
          label: `${admin.name} (${admin.email || admin.role_name})`
        }));
        
        setWatcherOptions(watcherOpts);
        
        // If no specific roles found, show all users as backup
        if (assignees.length === 0 && admins.length > 0) {
          console.log('No technicians/engineers found, showing all users for assignment');
          const allOptions = admins.map(admin => ({
            value: admin.email || admin.id.toString(),
            label: `${admin.name} (${admin.email || admin.role_name})`
          }));
          setAssignToOptions(prev => [...prev, ...allOptions]);
        }
        
        if (watchers.length === 0 && admins.length > 0) {
          console.log('No managers/admins found, showing all users for watchers');
          const allOptions = admins.map(admin => ({
            value: admin.email || admin.id.toString(),
            label: `${admin.name} (${admin.email || admin.role_name})`
          }));
          setWatcherOptions(allOptions);
        }
      } else {
        console.log('No admin_store_v1 found in localStorage');
      }
    } catch (error) {
      console.error('Error reading admin store:', error);
    }
  };

  // Load assignment options on component mount
  useEffect(() => {
    loadUsersByRole();
  }, []);

  // Form validation
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.customer_phone) {
      newErrors.customer_phone = "Customer phone number is required";
    }
    
    if (!formData.subject.trim()) {
      newErrors.subject = "Subject is required";
    }
    
    if (!formData.message.trim()) {
      newErrors.message = "Message is required";
    }

    if (isInstallationWithPriceType(formData.type_id)) {
      const priceStr = String(formData.installation_price ?? "").trim();
      if (!priceStr) {
        newErrors.installation_price = "Installation price is required";
      } else if (isNaN(Number(priceStr)) || Number(priceStr) < 0) {
        newErrors.installation_price = "Enter a valid amount (0 or greater)";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Get tickets store
  const getTicketsStore = () => {
    try {
      const ticketsStore = localStorage.getItem('tickets_store_v1');
      if (ticketsStore) {
        return JSON.parse(ticketsStore);
      }
    } catch (error) {
      console.error('Error reading tickets store:', error);
    }
    return { tickets: [], lastId: 1005 };
  };

  // Save tickets store
  const saveTicketsStore = (store) => {
    localStorage.setItem('tickets_store_v1', JSON.stringify(store));
  };

  // Generate ticket number
  const generateTicketNumber = (id) => {
    return `#${id}`;
  };

  // Get display names for form values
  const getDisplayNames = () => {
    const assignedTo = Array.isArray(formData.assign_to)
      ? assignToOptions.filter(opt => formData.assign_to.includes(opt.value)).map(o => o.label).join(', ')
      : (assignToOptions.find(opt => opt.value === formData.assign_to)?.label || "Unassigned");
    const group = groupOptions.find(opt => opt.value === formData.group_id);
    const priority = priorityOptions.find(opt => opt.value === formData.priority);
    const status = statusOptions.find(opt => opt.value === formData.status_id);
    const type = typeOptions.find(opt => opt.value === formData.type_id);
    const watchers = watcherOptions.filter(opt => formData.watchers.includes(opt.value));
    
    return {
      assignedTo: assignedTo || "Unassigned",
      group: group?.label || "Any",
      priority: priority?.label || "Low",
      status: status?.label || "New",
      type: type?.label || "Site survey",
      watchers: watchers.map(w => w.label)
    };
  };

  const handleInputChange = (name, value) => {
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === "type_id" && !isInstallationWithPriceType(value)) {
        next.installation_price = "";
      }
      return next;
    });
    if (name === "installation_price" || name === "type_id") {
      setErrors(prev => {
        const next = { ...prev };
        delete next.installation_price;
        return next;
      });
    }
  };



  const groupOptions = [
    { value: "", label: "Any" },
    { value: "1", label: "IT" },
    { value: "2", label: "Finance" },
    { value: "3", label: "Sales" }
  ];

  const priorityOptions = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" }
  ];

  const statusOptions = [
    { value: "1", label: "New" },
    { value: "2", label: "Work in progress" },
    { value: "3", label: "Resolved" },
    { value: "4", label: "Waiting on customer" },
    { value: "5", label: "Waiting on agent" },
    { value: "6", label: "Customer unreachable" },
    { value: "7", label: "Booked to a further date" },
    { value: "8", label: "Customer out of range" },
    { value: "9", label: "Already installed by another provider" },
    { value: "10", label: "Long distance" },
    { value: "11", label: "Power available" }
  ];

  const typeOptions = TICKET_TYPES;
  const isInstallationType = isInstallationWithPriceType(formData.type_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    // Get display names for API payload
    const displayNames = getDisplayNames();
    
    // For Installation tickets only: Check if phone number already exists
    if (isStrictInstallationType(displayNames.type) && formData.customer_phone) {
      setLoading(true);
      try {
        // Check customers table
        try {
          const customerCheck = await CustomersAPI.searchByPhone(formData.customer_phone);
          if (customerCheck && customerCheck.success && customerCheck.customer) {
            showError(`Phone number ${formData.customer_phone} already exists in the customers table. Installation tickets require unique phone numbers.`);
            setLoading(false);
            return;
          }
        } catch (checkError) {
          // 404 is fine (customer not found), but log other errors
          if (checkError.response?.status !== 404) {
            console.log('Customer check error:', checkError.message);
          }
        }
        
        // Check customer creators table (pending)
        const { default: CustomerCreaterAPI } = await import('../../helpers/CustomerCreaterAPI');
        try {
          const creatorCheck = await CustomerCreaterAPI.list({
            search: formData.customer_phone,
            status: 'pending',
            per_page: 10
          });
          
          if (creatorCheck && creatorCheck.success && creatorCheck.data && creatorCheck.data.length > 0) {
            const matchingCreator = creatorCheck.data.find(creator =>
              kenyanPhonesMatch(creator.phone, formData.customer_phone)
            );
            
            if (matchingCreator) {
              showError(`A pending installation request already exists for phone number ${formData.customer_phone}.`);
              setLoading(false);
              return;
            }
          }
        } catch (creatorCheckError) {
          console.log('Customer creator check error:', creatorCheckError.message);
        }
        
        // Check tickets table (active + archived)
        try {
          const [activeCheck, archivedCheck] = await Promise.allSettled([
            TicketsAPI.getAll({ search: formData.customer_phone, per_page: 10 }),
            TicketsAPI.getArchived({ search: formData.customer_phone, per_page: 10 })
          ]);

          const activeData   = activeCheck.status   === 'fulfilled' ? (activeCheck.value?.data   || []) : [];
          const archivedData = archivedCheck.status === 'fulfilled' ? (archivedCheck.value?.data || []) : [];
          const allTickets   = [...activeData, ...archivedData];

          if (allTickets.length > 0) {
            const matchingTicket = allTickets.find(ticket =>
              kenyanPhonesMatch(
                ticket.customer_phone || ticket.customerPhone || ticket.customer?.phone,
                formData.customer_phone
              )
            );
            
            if (matchingTicket) {
              const archivedNote = archivedData.find(t => t.id === matchingTicket.id) ? ' (archived)' : '';
              showError(`Phone number ${formData.customer_phone} already exists in ticket #${matchingTicket.number || matchingTicket.id}${archivedNote}. Installation tickets require unique phone numbers.`);
              setLoading(false);
              return;
            }
          }
        } catch (ticketCheckError) {
          console.log('Ticket check error:', ticketCheckError.message);
        }
      } catch (error) {
        console.error('Error checking phone number:', error);
        // Continue with submission if check fails (backend will also validate)
      }
    }
    
    setLoading(true);
    
    try {
      // Prepare ticket data for API
      const createdBy = user?.name || user?.display_name || user?.email || user?.username || "Unknown";
      const normalizedPhone = normalizeKenyanPhone(formData.customer_phone);
      const ticketData = {
        customer_id: formData.customer_id || null,
        customer_phone: normalizedPhone,
        customer_name: formData.customer_name,
        customer_email: formData.mail_cc, // Use mail_cc as customer email
        createdBy,
        
        subject: formData.subject.trim(),
        description: formData.message.trim(),
        
        priority: formData.priority,
        status: displayNames.status, // Send label (e.g. "New")
        type: displayNames.type, // Send label (e.g. "Installation")
        group: displayNames.group, // Send label (e.g. "IT")
        
        assigned_to: Array.isArray(formData.assign_to) && formData.assign_to.length > 0 ? formData.assign_to : null,
        watched_by: formData.watchers.join(','),
        
        hidden: formData.hidden ? 1 : 0
      };

      if (isInstallationWithPriceType(displayNames.type)) {
        const installationPrice = parseFloat(String(formData.installation_price).trim());
        ticketData.installation_price = installationPrice;
        ticketData.subject = subjectWithInstallationPrice(ticketData.subject, installationPrice);
      }

      // Use TicketsAPI to create ticket in database
      const response = await TicketsAPI.create(ticketData);
      
      setLoading(false);
      
      if (response && (response.success || response.id)) {
        const ticketId = response.ticket_id || response.id;
        showSuccess(`Ticket #${ticketId || 'created'} created successfully!`);
        navigate('/admin/tickets/dashboard');
      } else {
        throw new Error(response?.message || response?.error || 'Failed to create ticket');
      }
      
    } catch (error) {
      console.error("Error creating ticket:", error);
      // Log the actual server response if available
      if (error.response) {
        console.error("Server response:", error.response.data);
        console.error("Server status:", error.response.status);
        console.error("Server headers:", error.response.headers);
        const serverError = error.response.data?.error || error.response.data?.message || JSON.stringify(error.response.data);
        showError("Error creating ticket: " + serverError);
      } else if (error.request) {
        console.error("Request was made but no response received:", error.request);
        showError("Error creating ticket: No response from server. Please check your connection.");
      } else {
        console.error("Error setting up request:", error.message);
        showError("Error creating ticket: " + (error.message || "Please try again."));
      }
      setLoading(false);
    }
  };

  return (
    <React.Fragment>
      <Head title="Create Ticket" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>Create Ticket</BlockTitle>
            <BlockDes className="text-soft">Create a new support ticket</BlockDes>
          </BlockHeadContent>
        </BlockHead>

        <Block size="lg">
          <Row className="g-gs">
            <Col lg="8">
              <PreviewCard className="card-bordered">
                <div className="card-inner">
                  <form onSubmit={handleSubmit} className="form-validate">
                    <Row className="g-gs">
                      <Col md="6">
                        <div className="form-group">
                          <label className="form-label">Customer Phone</label>
                          <div className="form-control-wrap" style={{ position: 'relative' }}>
                            <div className="input-group" ref={phoneInputRef}>
                              <div className="input-group-prepend">
                                <span className="input-group-text"><Icon name="call" /></span>
                              </div>
                              <input
                                type="text"
                                className={`form-control ${errors.customer_phone ? 'is-invalid' : ''}`}
                                placeholder="Enter phone number or name"
                                value={formData.customer_phone}
                                onChange={(e) => handleCustomerPhoneChange(e.target.value)}
                                onBlur={handleCustomerPhoneBlur}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                onKeyDown={(e) => {
                                  if (!showSuggestions) return;
                                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)); }
                                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, 0)); }
                                  else if (e.key === 'Enter' && activeSuggestion >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeSuggestion]); }
                                  else if (e.key === 'Escape') { setShowSuggestions(false); setActiveSuggestion(-1); }
                                }}
                                autoComplete="off"
                              />
                            </div>
                            {/* Autocomplete dropdown */}
                            {showSuggestions && (
                              <div ref={suggestionRef} style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                                background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: '260px',
                                overflowY: 'auto', marginTop: '2px'
                              }}>
                                {suggestionLoading ? (
                                  <div style={{ padding: '10px 14px', color: '#6b7280', fontSize: '13px' }}>
                                    <Icon name="loader" className="spinning" /> Searching...
                                  </div>
                                ) : suggestions.map((c, idx) => {
                                  const phone = c.phone_number || c.phone || c.mobile || '';
                                  const name = c.name || c.full_name || 'Unknown';
                                  const status = c.billing_type?.label || c.billing_type || '';
                                  // Highlight matched portion
                                  const q = formData.customer_phone;
                                  const hi = (str) => {
                                    const i = str.toLowerCase().indexOf(q.toLowerCase());
                                    if (i < 0 || !q) return <span>{str}</span>;
                                    return <span>{str.slice(0, i)}<mark style={{backgroundColor:'#fef08a',padding:0,borderRadius:'2px'}}>{str.slice(i, i + q.length)}</mark>{str.slice(i + q.length)}</span>;
                                  };
                                  return (
                                    <div
                                      key={c.id || idx}
                                      onMouseDown={() => selectSuggestion(c)}
                                      style={{
                                        padding: '8px 14px', cursor: 'pointer', fontSize: '13px',
                                        borderBottom: idx < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                                        backgroundColor: idx === activeSuggestion ? '#eff6ff' : 'transparent',
                                        display: 'flex', alignItems: 'center', gap: '10px'
                                      }}
                                      onMouseEnter={() => setActiveSuggestion(idx)}
                                    >
                                      <div style={{
                                        width: '32px', height: '32px', borderRadius: '50%',
                                        backgroundColor: '#526484', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '13px', fontWeight: '600', flexShrink: 0
                                      }}>
                                        {name.charAt(0).toUpperCase()}
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hi(name)}</div>
                                        <div style={{ color: '#6b7280', fontSize: '12px' }}>{hi(phone)}{status ? ` · ${status}` : ''}</div>
                                      </div>
                                      <Icon name="arrow-right" style={{ color: '#9ca3af', fontSize: '12px', flexShrink: 0 }} />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          {errors.customer_phone && <div className="invalid-feedback d-block">{errors.customer_phone}</div>}
                          {searchingCustomer && (
                            <small className="text-muted d-block mt-1">
                              <Icon name="loader" className="spinning" /> Searching customer...
                            </small>
                          )}
                          </div>
                        </div>
                      </Col>
                      
                      {/* Customer Details Display */}
                      {customerFound && (
                        <Col md="12">
                          <div className="alert alert-success" style={{
                            backgroundColor: '#f0fdf4',
                            borderColor: '#86efac',
                            padding: '12px 16px',
                            marginTop: '8px'
                          }}>
                            <div style={{display: 'flex', alignItems: 'flex-start', gap: '12px'}}>
                              <Icon name="check-circle" style={{fontSize: '20px', color: '#16a34a', marginTop: '2px'}} />
                              <div style={{flex: 1}}>
                                <strong style={{color: '#16a34a', fontSize: '14px', display: 'block', marginBottom: '8px'}}>
                                  Customer Found
                                </strong>
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px'}}>
                                  <div>
                                    <span style={{fontSize: '12px', color: '#6b7280', display: 'block'}}>Name:</span>
                                    <span style={{fontSize: '13px', color: '#1f2937', fontWeight: '500'}}>
                                      {customerFound.name || customerFound.full_name || 'N/A'}
                                    </span>
                                  </div>
                                  {customerFound.email && (
                                    <div>
                                      <span style={{fontSize: '12px', color: '#6b7280', display: 'block'}}>Email:</span>
                                      <span style={{fontSize: '13px', color: '#1f2937'}}>
                                        {customerFound.email || customerFound.user_email}
                                      </span>
                                    </div>
                                  )}
                                  {(customerFound.address || customerFound.location) && (
                                    <div>
                                      <span style={{fontSize: '12px', color: '#6b7280', display: 'block'}}>Location:</span>
                                      <span style={{fontSize: '13px', color: '#1f2937'}}>
                                        {customerFound.address || customerFound.location}
                                        {customerFound.city && `, ${customerFound.city}`}
                                      </span>
                                    </div>
                                  )}
                                  {customerFound.billing_type && (
                                    <div>
                                      <span style={{fontSize: '12px', color: '#6b7280', display: 'block'}}>Billing:</span>
                                      <span style={{fontSize: '13px', color: '#1f2937'}}>
                                        {typeof customerFound.billing_type === 'object' 
                                          ? customerFound.billing_type.label 
                                          : customerFound.billing_type}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </Col>
                      )}
                      
                      {!customerFound && formData.customer_phone && formData.customer_phone.length >= 10 && !searchingCustomer && (
                        <Col md="12">
                          <div className="alert alert-info" style={{
                            backgroundColor: '#f0f9ff',
                            borderColor: '#7dd3fc',
                            padding: '12px 16px',
                            marginTop: '8px'
                          }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                              <Icon name="info" style={{fontSize: '18px', color: '#0284c7'}} />
                              <span style={{fontSize: '13px', color: '#0c4a6e'}}>
                                New customer - This phone number will be saved with the ticket
                              </span>
                            </div>
                          </div>
                        </Col>
                      )}
                    </Row>
                    
                    <Row className="gy-4">
                      <div className="col-md-4">
                        <input type="hidden" name="Ticket[hidden]" value="0" />
                        <div className="input-holder-checkbox">
                          <div className="form-check form-switch">
                            <input 
                              type="checkbox" 
                              id="ticket-hidden" 
                              className="form-check-input" 
                              checked={formData.hidden}
                              onChange={(e) => handleInputChange('hidden', e.target.checked)}
                            />
                          </div>
                        </div>
                      </div>
                    </Row>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Assigned to
                      </label>
                      <div className="col-md-8">
                        <div className="input-wrap">
                          <RSelect
                            isMulti
                            closeMenuOnSelect={false}
                            value={assignToOptions.filter(option => formData.assign_to.includes(option.value))}
                            onChange={(values) => handleInputChange('assign_to', values ? values.map(v => v.value) : [])}
                            options={assignToOptions}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Group
                      </label>
                      <div className="col-md-8">
                        <div className="input-wrap">
                          <RSelect
                            value={groupOptions.find(option => option.value === formData.group_id)}
                            onChange={(value) => handleInputChange('group_id', value.value)}
                            options={groupOptions}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Watchers
                      </label>
                      <div className="col-md-8">
                        <div className="input-wrap">
                          <RSelect
                            isMulti
                            value={watcherOptions.filter(option => formData.watchers.includes(option.value))}
                            onChange={(values) => handleInputChange('watchers', values ? values.map(v => v.value) : [])}
                            options={watcherOptions}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Mail Cc
                      </label>
                      <div className="col-md-8">
                        <input 
                          type="text" 
                          className="form-control input-sm" 
                          value={formData.mail_cc}
                          onChange={(e) => handleInputChange('mail_cc', e.target.value)}
                          autoComplete="off" 
                        />
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Priority
                      </label>
                      <div className="col-md-8">
                        <div className="input-wrap">
                          <RSelect
                            value={priorityOptions.find(option => option.value === formData.priority)}
                            onChange={(value) => handleInputChange('priority', value.value)}
                            options={priorityOptions}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Status
                      </label>
                      <div className="col-md-8">
                        <div className="input-wrap">
                          <RSelect
                            value={statusOptions.find(option => option.value === formData.status_id)}
                            onChange={(value) => handleInputChange('status_id', value.value)}
                            options={statusOptions}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Type
                      </label>
                      <div className="col-md-8">
                        <div className="input-wrap">
                          <RSelect
                            value={typeOptions.find(option => option.value === formData.type_id)}
                            onChange={(value) => handleInputChange('type_id', value.value)}
                            options={typeOptions}
                          />
                        </div>
                      </div>
                    </div>

                    {isInstallationType && (
                      <div className="row mb-3">
                        <label className="col-form-label col-md-4">
                          Installation price (KES)
                        </label>
                        <div className="col-md-8">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`form-control input-sm ${errors.installation_price ? 'is-invalid' : ''}`}
                            value={formData.installation_price}
                            onChange={(e) => handleInputChange('installation_price', e.target.value)}
                            placeholder="e.g. 1500"
                            required
                          />
                          {errors.installation_price && (
                            <div className="invalid-feedback">{errors.installation_price}</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Subject
                      </label>
                      <div className="col-md-8">
                        <input 
                          type="text" 
                          className={`form-control input-sm ${errors.subject ? 'is-invalid' : ''}`}
                          value={formData.subject}
                          onChange={(e) => handleInputChange('subject', e.target.value)}
                          required 
                          autoComplete="off" 
                        />
                        {errors.subject && <div className="invalid-feedback">{errors.subject}</div>}
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4">
                        Message
                      </label>
                      <div className="col-md-8">
                        <textarea 
                          className={`form-control ${errors.message ? 'is-invalid' : ''}`}
                          rows="10"
                          value={formData.message}
                          onChange={(e) => handleInputChange('message', e.target.value)}
                          style={{ minHeight: "150px" }}
                        />
                        {errors.message && <div className="invalid-feedback">{errors.message}</div>}
                      </div>
                    </div>

                    <div className="row mb-3">
                      <label className="col-form-label col-md-4"></label>
                      <div className="col-md-8">
                        <div className="card-block">
                          <div className="card-block-header narrow-panel">
                            <strong>Attachments</strong>
                            <div className="right-buttons narrow-panel-button-block">
                              <button type="button" className="btn btn-outline-primary attachment-add-button ms-8">
                                Add file
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="row mb-3">
                      <div className="col-md-12">
                        <button 
                          type="submit" 
                          className="btn btn-primary pull-right" 
                          disabled={loading}
                        >
                          {loading ? "Creating Ticket..." : "Create Ticket"}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary mr-2" 
                          onClick={() => navigate('/admin/tickets/dashboard')}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                  </form>
                </div>
              </PreviewCard>
            </Col>

            <Col md="4" id="admin_support_tickets_create_panel_info">
              <PreviewCard className="card-no-border">
                <div className="card-header">
                  <strong>Contact details</strong>
                </div>
                <div className="card-body content-info">
                  {formData.customer_phone && formData.customer_phone.length >= 10 ? (
                    <div>
                      {loadingTickets ? (
                        <div className="text-center py-3">
                          <Icon name="loader" className="spinning" />
                          <p className="text-muted mt-2 mb-0">Loading tickets...</p>
                        </div>
                      ) : customerTickets.length > 0 ? (
                        <div>
                          <h6 className="mb-3" style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                            Previous Tickets ({customerTickets.length})
                          </h6>
                          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            {customerTickets.map((ticket) => (
                              <div 
                                key={ticket.id} 
                                className="mb-3 p-3 border rounded"
                                style={{ 
                                  backgroundColor: '#f9fafb',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#f9fafb';
                                }}
                                onClick={() => navigate(`/admin/tickets/view/${ticket.id}`)}
                              >
                                <div className="d-flex justify-content-between align-items-start mb-2">
                                  <div>
                                    <strong style={{ fontSize: '13px', color: '#1f2937' }}>
                                      {ticket.number || `#${ticket.id}`}
                                    </strong>
                                    <span 
                                      className="badge ms-2"
                                      style={{
                                        fontSize: '11px',
                                        backgroundColor: ticket.status === 'Resolved' ? '#10b981' : 
                                                       ticket.status === 'New' ? '#3b82f6' :
                                                       ticket.status === 'Work in progress' ? '#f59e0b' : '#6b7280',
                                        color: '#fff'
                                      }}
                                    >
                                      {ticket.status || 'Unknown'}
                                    </span>
                                    {ticket._archived && (
                                      <span className="badge ms-1" style={{ fontSize: '11px', backgroundColor: '#f59e0b', color: '#fff' }}>
                                        Archived
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: '11px', color: '#6b7280' }}>
                                    {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    }) : 'N/A'}
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#4b5563', marginBottom: '4px' }}>
                                  <strong>Subject:</strong> {ticket.subject || 'No subject'}
                                </div>
                                {ticket.priority && (
                                  <div style={{ fontSize: '11px', marginTop: '4px' }}>
                                    <span className="badge" style={{
                                      backgroundColor: ticket.priority === 'urgent' ? '#ef4444' :
                                                     ticket.priority === 'high' ? '#f59e0b' :
                                                     ticket.priority === 'medium' ? '#3b82f6' : '#6b7280',
                                      color: '#fff',
                                      fontSize: '10px'
                                    }}>
                                      {ticket.priority}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-3">
                          <Icon name="info" style={{ fontSize: '24px', color: '#9ca3af' }} />
                          <p className="text-muted mt-2 mb-0" style={{ fontSize: '13px' }}>
                            No previous tickets found for this phone number
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Icon name="call" style={{ fontSize: '32px', color: '#d1d5db' }} />
                      <p className="text-muted mt-2 mb-0" style={{ fontSize: '13px' }}>
                        Enter a customer phone number to view their ticket history
                      </p>
                    </div>
                  )}
                </div>
              </PreviewCard>
            </Col>
          </Row>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default CreateTicket;
